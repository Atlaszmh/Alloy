# Delve Weapon Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combat flows. No basic attack, wind-up or charging hold roots the hero any more: while one runs the hero walks at `actionMove` (0.6×) of its pace, facing the action, and every blow's and form's motion is a push added on top of the steering, less any part that points against it. Each weapon moves its own way (dagger darts in and hops out, sword lunges, axe wades, maul plants then leaps, staff sways, wand circles, bow steps back), a charged hold blow leaps as it is let go and then strikes, and a directional form the hero has walked past its aim point fires along the press's way. Ships as v0.48.0.

**Architecture:** The engine owns it. Data first: each weapon's `feel` rows gain `side` and `hop` (and a new `move` column), each weapon base a `sway` (`alternate` or `orbit`), `balance.json → delve.feel` gains `stepSeconds`, `actionMove` and `sideSteer`, and `HeroWeapon.sway` carries it. `HeroEntity.pushes` (a list of `Push`: `lunge`, `stepIn` or `step`) replaces `HeroEntity.push`: each push adds a slice a tick by its progress, cut at its stop foe's contact gap (`action.ts`: `startPush`, `endPushes`, `pushesTick`, `finishPushes`). `step.ts` moves the hero once a tick: the steering at its pace (slowed while it acts or recovers), then every push's slice, projected off the steering; the hero faces its action (`actionFacing`, `windupDir`). `basic.ts` lunges on every swing, starts a blow's step at its strike (`blowStep`: step back, hop and side step, the side by the steering or the weapon's sway, `HeroEntity.swaySide`), and turns a charged hold blow's release into a leap (`HeroEntity.swing.released`) that strikes as it lands. `castTick` fires a directional form along the press's way once the hero has passed its aim point (`HeroEntity.windup.from`). The DPS sim holds the hero at its start plus what its running pushes have moved it. The client's lean follows any swing and the wind-up's facing, and a hold blow's charge readout ends at its release.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3, React 19, PixiJS 8, Playwright (the Delve E2E specs).

**Spec:** `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md` at `71fef72` (the requirements; read it first: its Pushes and blending, No rooting and leap sections carry ordering rules the code follows exactly).

---

## Measured before and after: read before executing

Everything below was built and run on a scratch copy of HEAD `71fef72`. The spec's starting values ship unchanged; nothing is tuned. Task 7 measures again and stops if a number differs; if a pacing rail breaks, it stops and brings the numbers to the user (the spec: the fix is the user's call).

| | Before (v0.47.0) | After (this plan) |
|---|---|---|
| Pacing: first dives (each ≥ 3, mean 4–12) | 12, 12, 5, 3 (mean 8) | 11, 11, 11, 13 (mean 11.5) |
| Pacing: dive 6, dive 12 means | 27.75, 35.75 | 25.5, 35 |
| Pacing: Frost dive 1 → dive 12 | 10 → 26.5 | 8.5 → 32.5 |
| Pacing: legendaries at dive 12; own pair's reaction | 4.75; 6 of 6 | 6; 6 of 6 |
| Pacing: the 15-pair sweep at dive 6 | median 28, 18–41 (allowed 16.8–44.8) | median 27, 21–37 (allowed 16.2–43.2) |
| Pacing: seconds a floor (8–60) | 29.09 | 20.89 |

Every rail holds; the closest is the first dives' mean, 11.5 against its ceiling of 12 (bows kite, melee closes faster, and every hero walks while it casts, so early floors go quicker). The pacing rails held after each of Tasks 1–6 on the scratch copy.

The DPS Lab grid (depth 10, one dummy and the pack, one seed, 9,144 runs), after against before: **the basic grid is identical** (504 of 504 rows, to the hundredth, strikes too), as the spec's gate asks. The ability grid moves in 1,683 of its 8,640 rows, all of them Bolt, Volley or Lance (the forms that recoil): median of those +0.5% (1,124 up, 559 down), from −54.8% to +140.6%, the whole grid's damage +0.8%. By payment and kind every median is +0.0%. The rows' casts barely move: basics no longer wait out a form's recoil, so they swing (and feed mana) sooner, and their stacks meet the ability's at other moments, which moves its reactions (the spec expects this shift; it is not a regression). No row stopped dealing damage.

---

## Where the spec left room

- **The push's shape.** `Push { kind, dx, dy, start, until, stopId, done, movedX, movedY }` (in `types/arpg.ts`, with `PushKind = 'lunge' | 'stepIn' | 'step'`): `dx`, `dy` are the direction times the distance, `done` the progress so far (0..1) and `movedX`, `movedY` the displacement applied so far. `action.ts` exports `startPush(ctx, kind, dir, distance, seconds, stopId?, delay?)`, `endPushes(h, kind)`, `pushesTick(ctx, steer)` and `finishPushes(ctx, kind)`; `pushTick` goes.
- **A slice's order.** Each push's slice is taken from where the hero stands after the steering and the pushes before it (in the order they began), clamped to the arena, then cut at its stop foe's contact gap (`contactAt`, as before). A push whose foe is gone ends at once, even in a lunge's planted part (as today).
- **`side` and `hop`** are optional in the row type and the schema (absent is 0), and the JSON lists only the non-zero ones. The staff says `"sway": "alternate"` explicitly (the default), the wand `"orbit"`.
- **The side.** `strike(ctx, steer, stage)` takes the stick (length up to 1); its part square to the blow is `steer · (−dir.y, dir.x)`, and side 1 is `(−dir.y, dir.x)` (to the right of a blow aimed up). The steering picks the side from `sideSteer` less 1e-9 up, so a stick at exactly 0.3 counts despite rounding. `swaySide` starts at 1, so a staff's first side step (by its sway) goes to side −1.
- **The step** (`blowStep` in `basic.ts`) is one push, `step`, of the sum of the step back (`max(0, −move)`), the hop (both away from the blow) and the side step, normalised, over `stepSeconds`, with no stop. Melee and ranged alike.
- **Acquisition.** `swingReach(w, s, manual)` drops its `committed` parameter: `lunge = max(0, move)` for any weapon (a ranged row has no forward move), `acquire = reach + lunge + (manual ? 1 : 0)`.
- **The leap.** Let go at stage `s` ≥ 1 with `feel[stage row].move > feel.medium.move`: a `lunge` push of the difference along the re-aimed direction over `stepSeconds`, stopping at the re-aimed target or else `foeAhead(dir, reach + leap, arc)` with the stage row's reach and arc; `swing.released = s`, `swing.strikeAt = t + stepSeconds`. At `strikeAt`, `step.ts` calls `strike(ctx, steer, released)` before anything else about the swing. `swingStrikes` counts a released swing as striking, and the automatic-mode block (a target gone, a move clearing `committed`) skips it.
- **Facing** is set once a tick, after the pushes (`actionFacing` in `step.ts`): a swing's `dir`, a wind-up's `windupDir`, or toward a hold's `aim`; an action with no way (a self-centred wind-up, a hold with no aim) keeps the facing. `startSwing` now always faces its swing.
- **Past the aim point.** `passedAim` counts the hero past `at` when the way to it has turned 90° or more from the way from `from`, or the hero stands on it. The spec says "more than 90°"; at exactly 90° (or on `at`) there is no way to turn round to, so the press's way is the one kept. It applies to directional forms only (`DIRECTIONAL`, now exported from `targeting.ts`): past it, `windupDir` faces along the press's way and `castTick` fires at `h + (at − from)` (along the press's way, at the press's distance) in place of the manual aim or of the fallback `at`. A placed form's wind-up keeps facing its `at` (turning round, as the spec's facing rule says) and lands there.
- **Task order.** Task 2 turns the push into the list with the old movement rules (a running push still stops the steering; for one tick that includes a push whose stop foe has just died, which the old `pushTick` let go at once), so its behaviour changes are only the ending rules and the swing no longer waiting for a push. Task 3 then blends the steering and removes the rooting. So a few existing tests change in both tasks.
- **A charged hold blow already at contact** still waits `stepSeconds` before it strikes (its leap has nowhere to go): the spec times the strike from the release.
- **The DPS sim** has no test of its own for the held position: the gate (the basic grid identical, Task 7) is its check.
- **Data tests the spec didn't list.** `delve-chains.test.ts`'s data tests pin every number of the rows (the v0.45.0 strings, "a medium row is halfway between light and heavy", "the maul's light is its medium, softer", "a hold row is the heavy one"): they now leave out the motion columns (`move`, `side`, `hop`), which the new `delve-weapon-flow.test.ts` pins against the spec's table instead.
- **Client fixtures.** The spec expects `reactions.test.ts` and others to need `pushes` and `swaySide`, but those fixtures are partial objects cast through `unknown` and read neither, so they stay. Only `anticipation.test.ts` and `mana-fx.test.ts` gain the fields the lean now reads (`swing.released`, `windup.from`, and a `form` on their chains' moves, since `windupDir` asks whether a form is directional).
- **The wind-up's lean** follows `windupDir` (exported from the engine), so the lean and the sprite agree past the aim point and on a self-centred form.
- **"A charged maul hold blow leaping to contact, then striking, then stepping":** a maul's hold row has no step, so the maul test covers the leap to contact and the strike, and a dagger's hold blow (leap, strike, then its hop) covers the step.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task** (Task 9 makes two: the docs, then the version). Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/data/balance.json` and `delve.json` (hand-laid-out JSON), `packages/engine/src/arpg/abilities/targeting.ts`, `CLAUDE.md` and the spec docs; nor do they format `packages/engine/tests/delve-chain-feel.test.ts` (clean, but see "One stray byte"). Every other file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **One stray byte.** Line 160 of `packages/engine/tests/delve-chain-feel.test.ts` (the test name `reach full charge at holdTime × tempo (holdFull)`) holds a raw Latin-1 `×` (the byte `0xD7`) in an otherwise UTF-8 file. The plan never edits that line and its commit blocks never format the file, but an editor that rewrites the whole file may turn the byte into `�` (U+FFFD). After editing that file (Tasks 2 and 6), `git diff packages/engine/tests/delve-chain-feel.test.ts` must show only the plan's lines; if line 160 shows as well, put the byte back: `node -e "const f='packages/engine/tests/delve-chain-feel.test.ts',fs=require('fs'),b=fs.readFileSync(f),i=b.indexOf(Buffer.from([0xef,0xbf,0xbd]));if(i>=0)fs.writeFileSync(f,Buffer.concat([b.subarray(0,i),Buffer.from([0xd7]),b.subarray(i+3)]))"` (run from the repo root).
- **Line endings:** `packages/engine/src/arpg/abilities/targeting.ts`, `CLAUDE.md` and the specs `2026-09-25-delve-combat-weight-design.md` and `2026-09-29-delve-moves-and-chains-design.md` use CRLF; every other file here is LF (the weapon flow and ability-system specs too). Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- **How the edits read.** "Replace: A with: B" is one Edit (old A, new B). "After: A add: B" is the Edit old A, new A followed by B on the next line; "Before: A add: B" is old A, new B followed by A. Every A is unique in its file at that point, in the order given, so apply each file's edits top to bottom (the scratch copy checked that applying them in order gives exactly the tested file). "Create `f`:" is a Write.
- `arpg/combat.ts`, `arpg/action.ts`, `arpg/basic.ts` and the modules in `arpg/abilities/` import each other: only ever read such an import inside a function, never at module top level.
- Engine `tsc` covers `src` only (Vitest doesn't type-check, so a test reading a field that no longer exists passes vacuously: this plan updates every such read); client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y), radius 0.5, walking `stats.moveSpeed` a second at full pace; `dummy(x, y)` is a sturdy Fire foe (1e6 life) that doesn't fight back (a dummy of the arena's, which knockback still moves); `place(w, gap)` puts the first foe `gap` from the hero's edge, straight up. `nearestMonster` measures from the hero's **centre** to the foe's edge, so an acquisition test places a foe at `range + … − hero.radius`. The fixture's starting weapon is a sword (range 1.9; light `move` 0.4); its chains are one medium move each (a Fire Bolt, a Frost Ward, a charged Fire Nova).
- **Every engine task runs the whole suite, the pacing rails included.** On the scratch copy they held after each of Tasks 1–6. **If `delve-pacing.test.ts` fails in any task, stop:** don't tune anything; report the numbers (Task 7's scripts give them) to the user, whose call the fix is.
- **The client is never red.** It consumes the engine's bundle (`dist`), which Tasks 1–6 don't rebuild; after Task 7 rebuilds it, the client's 716 tests and its typecheck still pass (its fixtures cast partial heroes through `unknown`), and Task 8 changes the client.

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

**E2E scratch config** (Task 9; create it then, delete it at the end of Task 9, never commit it): `packages/client/playwright.scratch.config.ts`. Playwright's own config starts Vite on port 5199, which another project on this machine may hold; this one reuses the 5288 dev server instead.

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

**The measurement's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\flow-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/flow-before`). They were made from the engine at HEAD (v0.47.0) and must not be regenerated after Task 1 starts: `before-depth10.json` (the DPS Lab grid) and `pacing-before.txt`, with the scripts `snapshot.mjs`, `pacing.mjs` and `compare.mjs`. The folder also holds the plan author's own after-files; Task 7 overwrites `after-depth10.json` and `pacing-after.txt` with yours. The scripts' texts are in Task 7, in case the folder is gone; Task 1 checks the before files and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/data/delve.json`, `src/data/balance.json` | each weapon row's `side` and `hop` and the new `move` column; the staff's and the wand's `sway`; `delve.feel.stepSeconds`, `actionMove`, `sideSteer` (hand-edit, never format) |
| `src/data/schemas.ts` | a row's `side`, `hop`; a base's `sway`; the three feel numbers |
| `src/types/delve.ts` | `ComboStepDef.side`/`hop`, `WeaponSway`, `GearBaseDef.sway`, `HeroWeapon.sway`, `FeelBalance.stepSeconds`/`actionMove`/`sideSteer` |
| `src/types/arpg.ts` | `PushKind`, `Push`; `HeroEntity.pushes` (for `push`), `swaySide`, `windup.from`, `swing.released` |
| `src/delve/hero-stats.ts` | `HeroWeapon.sway` |
| `src/arpg/action.ts` | pushes as a list of slices: `startPush(kind, …)`, `endPushes`, `pushesTick`, `finishPushes`; `cancelSwing` ends only the lunge; `swingStrikes` counts a leap |
| `src/arpg/step.ts` | one movement a tick (the steering, then the slices, projected), no rooting, `actionMove`, facing (`actionFacing`), `h.moving`; the swing gate and the tap's no-ageing rule drop the push; a released swing strikes as it lands |
| `src/arpg/basic.ts` | a lunge on every swing, acquisition at reach plus lunge, the strike's step (`blowStep`), the hold blow's leap |
| `src/arpg/abilities/cast.ts` | form pushes' kinds, no push cleared by a cast, `castTick` finishes its step-in; `windup.from`, `windupDir`, the fire direction past the aim point; `holdTick`'s comment |
| `src/arpg/abilities/targeting.ts` | export `DIRECTIONAL` (CRLF, hand-edit, never format) |
| `src/arpg/dodge.ts`, `world.ts`, `sandbox.ts` | clearing and initialising `pushes` and `swaySide` |
| `src/arpg/dps-sim.ts` | the held position: start plus the running pushes' displacement |
| `src/index.ts` | `windupDir` |
| `tests/delve-weapon-flow.test.ts` (new) | the spec's engine tests |
| `tests/{ability-cast,delve-chains,delve-chain-feel,delve-combat-weight,delve-training}.test.ts` | updated to the new rules |

`tests/delve-pacing.test.ts`, `tests/fixtures/arena.ts`, `bot.ts`, `forms.ts` and `combat.ts` need no edit.

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/arena/fx/anticipation.ts` | the lean follows any swing in its startup, ends at a hold blow's release, and leans a wind-up by `windupDir` |
| `features/delve/arena/useArenaCore.ts` | a hold blow's charge readout ends at its release |
| tests | `features/delve/arena/fx/__tests__/{anticipation,mana-fx}.test.ts`, `features/delve/__tests__/arena-hud-snapshot.test.ts` |

E2E: the Delve specs pass unchanged. `packages/client/package.json`: 0.47.0 → 0.48.0 (Task 9).

**Docs:** `CLAUDE.md` (the Delve paragraph and its spec, engine, data and DPS Lab bullets), the weapon flow spec's status line (Task 7), and superseded notes in the combat-weight, ability-system and moves-and-chains specs.

---

## Chunk 1: Engine: the weapon styles' data

### Task 1: Side steps, hops, sway, and the flow's numbers

Data and types only: each weapon row can carry `side` and `hop`, each weapon base a `sway`, the three new feel numbers load, and `HeroWeapon.sway` is computed; nothing reads them yet. The `move` column changes in Task 5, with the code that reads it the new way.

**Files:**
- Create: `packages/engine/tests/delve-weapon-flow.test.ts`
- Modify: `packages/engine/tests/delve-chains.test.ts:176,203` (the v0.45.0 strings compare rows without their steps)
- Modify: `packages/engine/src/types/delve.ts:35,57,71,230,571`
- Modify: `packages/engine/src/data/schemas.ts:453,485,947`
- Modify: `packages/engine/src/data/delve.json:26,136,168` (the dagger's hop, the staff's and the wand's side and sway; hand-edit, never format)
- Modify: `packages/engine/src/data/balance.json:193` (hand-edit, never format)
- Modify: `packages/engine/src/delve/hero-stats.ts:193`

- [ ] **Step 1: Check the measurement's "before" files**

Task 7 compares against the engine at HEAD, which exists only until this task's edits.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/flow-before)`
Expected, among others: `before-depth10.json`, `pacing-before.txt`, `compare.mjs`, `pacing.mjs`, `snapshot.mjs`.

If `before-depth10.json` or `pacing-before.txt` is missing, make them now from HEAD (first write any missing script from the texts in Task 7): `(cd packages/engine && pnpm build)`, then from `<before>`: `node snapshot.mjs C:/Projects/Alloy/packages/engine/dist/index.js before-depth10.json` (prints `runs 9144 …`, about 10 s) and `node pacing.mjs C:/Projects/Alloy/packages/engine/dist/index.js > pacing-before.txt` (about a minute). `pacing-before.txt` must read as the "Before" column of the header's table.

- [ ] **Step 2: Write the failing tests**

The weapon flow spec's engine tests get their own file; later tasks add to it.

Create `packages/engine/tests/delve-weapon-flow.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import { bal, gear, registry } from './fixtures/arena.js';

// See the weapon flow spec. The fixture arena's hero stands at (13, 36) facing up (−y);
// `dummy(x, y)` is a sturdy Fire foe that doesn't fight back.

const weapons = registry.getGearBasesForSlot('weapon');
/** Each weapon's `key` by kind (light, medium, heavy, hold), 0 where a row leaves it out. */
const byKind = (key: 'move' | 'side' | 'hop') =>
  Object.fromEntries(weapons.map((b) => [b.id, MOVE_KINDS.map((k) => b.feel![k][key] ?? 0)]));
const NONE = [0, 0, 0, 0];

describe('data: weapon styles', () => {
  it('loads the feel numbers', () => {
    expect(bal.feel.stepSeconds).toBe(0.15);
    expect(bal.feel.actionMove).toBe(0.6);
    expect(bal.feel.sideSteer).toBe(0.3);
  });

  it("each weapon's side steps, hops and sway", () => {
    expect(byKind('side')).toEqual({
      dagger: NONE,
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: [0.5, 0.7, 1.0, 1.3],
      wand: [0.35, 0.45, 0.6, 0.8],
      bow: NONE,
    });
    expect(byKind('hop')).toEqual({
      dagger: [0, 0, 0.8, 0.8],
      sword: NONE,
      axe: NONE,
      maul: NONE,
      staff: NONE,
      wand: NONE,
      bow: NONE,
    });
    expect(Object.fromEntries(weapons.map((b) => [b.id, b.sway ?? 'alternate']))).toEqual({
      dagger: 'alternate',
      sword: 'alternate',
      axe: 'alternate',
      maul: 'alternate',
      staff: 'alternate',
      wand: 'orbit',
      bow: 'alternate',
    });
    // Unarmed keeps its small lunge, and has no step.
    for (const k of MOVE_KINDS) {
      expect(bal.hero.feel[k].side ?? 0).toBe(0);
      expect(bal.hero.feel[k].hop ?? 0).toBe(0);
    }
  });

  it("the hero's weapon carries its sway", () => {
    const sway = (baseId: string) =>
      computeHeroStats({ weapon: gear('fire', 'weapon', baseId) }, registry).weapon.sway;
    expect(sway('wand')).toBe('orbit');
    expect(sway('staff')).toBe('alternate');
    expect(computeHeroStats({}, registry).weapon.sway).toBe('alternate');
  });
});
```

In `packages/engine/tests/delve-chains.test.ts` (it pins each weapon's rows to its v0.45.0 string; the steps are new, so it compares them without):

Before:
```ts
/** Every number of a row, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
```
add:
```ts
/** A row without its step (`side`, `hop`: the weapon flow spec's, pinned in delve-weapon-flow.test.ts). */
function stepless({ side: _side, hop: _hop, ...row }: ComboStepDef): ComboStepDef {
  return row;
}

```

Replace:
```ts
        chain.map((k) => feel[k]),
        id,
```
with:
```ts
        chain.map((k) => stepless(feel[k])),
        id,
```

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 3 failed, 55 passed (58): all three of `data: weapon styles` ("loads the feel numbers": `expected undefined to be 0.15`; "each weapon's side steps, hops and sway"; "the hero's weapon carries its sway": `expected undefined to be 'orbit'`).

- [ ] **Step 4: The types**

In `packages/engine/src/types/delve.ts`:

Replace:
```ts
  /** Units of motion: a lunge over the startup (melee) or a recoil after the release (negative, ranged). */
  move: number;
```
with:
```ts
  /**
   * Units of motion along the attack: a lunge over the startup (positive), or a
   * step back after the strike (negative). See the weapon flow spec.
   */
  move: number;
  /** Units of a sideways step after the strike (default 0); see `HeroWeapon.sway`. */
  side?: number;
  /** Units of a hop back, away from the attack, after the strike (default 0). */
  hop?: number;
```

Before:
```ts
export interface GearBaseDef {
```
add:
```ts
/**
 * Which side a blow's side step takes when the steering doesn't pick one:
 * `alternate` flips each blow (the staff), `orbit` keeps the last side (the
 * wand, circling its target).
 */
export type WeaponSway = 'alternate' | 'orbit';

```

Before:
```ts
  weight: number;
  implicits: ImplicitTemplate[];
```
add:
```ts
  /** Weapons only: the side a blow's side step takes when the steering doesn't pick one (default `alternate`). */
  sway?: WeaponSway;
```

Replace:
```ts
  /** How long a recoil push takes. */
  recoilSeconds: number;
```
with:
```ts
  /** How long a form's recoil push takes. */
  recoilSeconds: number;
  /** How long a blow's step (its step back, side step and hop) takes, from the strike; a hold blow's leap too. */
  stepSeconds: number;
  /** Move speed multiplier while a swing, a charging hold blow, a wind-up or a charging hold runs. */
  actionMove: number;
  /** The steering's lateral part (of a full stick) that picks a side step's side. */
  sideSteer: number;
```

Before:
```ts
  /** A blow's row by its kind (a manual hold blow's stages read medium, heavy and hold). */
```
add:
```ts
  /** The side a side step takes when the steering doesn't pick one. */
  sway: WeaponSway;
```

- [ ] **Step 5: The schemas**

In `packages/engine/src/data/schemas.ts`:

Before:
```ts
  power: z.number().positive(),
  heft: z.number().min(0).max(1),
```
add:
```ts
  side: z.number().min(0).optional(),
  hop: z.number().min(0).optional(),
```

Before:
```ts
        weight: z.number().positive(),
        implicits: z.array(
```
add:
```ts
        sway: z.enum(['alternate', 'orbit']).optional(),
```

Before:
```ts
    lungeHold: z.number().min(0).max(1),
```
add:
```ts
    stepSeconds: z.number().positive(),
    actionMove: z.number().min(0).max(1),
    sideSteer: z.number().min(0).max(1),
```

- [ ] **Step 6: The data**

In `packages/engine/src/data/delve.json` (hand-edit; the first edit is the dagger's, the second the staff's, the third the wand's):

Replace:
```json
        "heavy": { "time": 1.4, "startup": 0.35, "move": 0.7, "power": 1.7, "heft": 0.6, "arc": 150, "knockback": 0.3 },
        "hold": { "time": 1.4, "startup": 0.525, "move": 0.7, "power": 2.21, "heft": 0.8, "arc": 150, "knockback": 0.3 }
      },
```
with:
```json
        "heavy": { "time": 1.4, "startup": 0.35, "move": 0.7, "hop": 0.8, "power": 1.7, "heft": 0.6, "arc": 150, "knockback": 0.3 },
        "hold": { "time": 1.4, "startup": 0.525, "move": 0.7, "hop": 0.8, "power": 2.21, "heft": 0.8, "arc": 150, "knockback": 0.3 }
      },
```

Replace:
```json
      "attack": {
        "kind": "bolt",
        "range": 8.5,
        "speed": 13
      },
      "feel": {
        "light": { "time": 0.9, "startup": 0.3, "move": -0.1, "power": 0.9, "heft": 0.2 },
        "medium": { "time": 1.1, "startup": 0.375, "move": -0.2, "power": 1.15, "heft": 0.4, "size": 1.4, "explode": 0.5 },
        "heavy": { "time": 1.3, "startup": 0.45, "move": -0.3, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 },
        "hold": { "time": 1.3, "startup": 0.675, "move": -0.3, "power": 1.82, "heft": 0.8, "size": 1.8, "explode": 1.0 }
```
with:
```json
      "sway": "alternate",
      "attack": {
        "kind": "bolt",
        "range": 8.5,
        "speed": 13
      },
      "feel": {
        "light": { "time": 0.9, "startup": 0.3, "move": -0.1, "side": 0.5, "power": 0.9, "heft": 0.2 },
        "medium": { "time": 1.1, "startup": 0.375, "move": -0.2, "side": 0.7, "power": 1.15, "heft": 0.4, "size": 1.4, "explode": 0.5 },
        "heavy": { "time": 1.3, "startup": 0.45, "move": -0.3, "side": 1.0, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 },
        "hold": { "time": 1.3, "startup": 0.675, "move": -0.3, "side": 1.3, "power": 1.82, "heft": 0.8, "size": 1.8, "explode": 1.0 }
```

Replace:
```json
      "attack": {
        "kind": "bolt",
        "range": 7.5,
        "speed": 17
      },
      "feel": {
        "light": { "time": 0.9, "startup": 0.2, "move": -0.05, "power": 0.9, "heft": 0.1 },
        "medium": { "time": 1.05, "startup": 0.225, "move": -0.075, "power": 1.1, "heft": 0.2, "size": 1.25 },
        "heavy": { "time": 1.2, "startup": 0.25, "move": -0.1, "power": 1.3, "heft": 0.3, "size": 1.5 },
        "hold": { "time": 1.2, "startup": 0.375, "move": -0.1, "power": 1.69, "heft": 0.5, "size": 1.5 }
```
with:
```json
      "sway": "orbit",
      "attack": {
        "kind": "bolt",
        "range": 7.5,
        "speed": 17
      },
      "feel": {
        "light": { "time": 0.9, "startup": 0.2, "move": -0.05, "side": 0.35, "power": 0.9, "heft": 0.1 },
        "medium": { "time": 1.05, "startup": 0.225, "move": -0.075, "side": 0.45, "power": 1.1, "heft": 0.2, "size": 1.25 },
        "heavy": { "time": 1.2, "startup": 0.25, "move": -0.1, "side": 0.6, "power": 1.3, "heft": 0.3, "size": 1.5 },
        "hold": { "time": 1.2, "startup": 0.375, "move": -0.1, "side": 0.8, "power": 1.69, "heft": 0.5, "size": 1.5 }
```

In `packages/engine/src/data/balance.json` (hand-edit, in `delve.feel`):

Before:
```json
      "lungeHold": 0.6,
```
add:
```json
      "stepSeconds": 0.15,
      "actionMove": 0.6,
      "sideSteer": 0.3,
```

- [ ] **Step 7: `HeroWeapon.sway`**

In `packages/engine/src/delve/hero-stats.ts` (in `computeHeroStats`):

Replace:
```ts
        feel,
        blows,
      }
    : { baseId: null, kind: 'melee', range: 1.4, arc: 90, speed: 0, pierce: false, feel, blows };
```
with:
```ts
        sway: armed.sway ?? 'alternate',
        feel,
        blows,
      }
    : {
        baseId: null,
        kind: 'melee',
        range: 1.4,
        arc: 90,
        speed: 0,
        pierce: false,
        sway: 'alternate',
        feel,
        blows,
      };
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 58 passed.

- [ ] **Step 9: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1315 tests pass in 76 files (the pacing rails included).

- [ ] **Step 10: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/delve/hero-stats.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/delve.json packages/engine/src/data/balance.json packages/engine/src/delve/hero-stats.ts
git commit -m "feat(engine): weapon flow data: side steps, hops, sway, and the step, action-move and side-steer numbers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 2: Engine: pushes become a list

### Task 2: Pushes as slices; what ends one; a swing no longer waits for one

`HeroEntity.pushes` replaces `HeroEntity.push`. Each push adds a slice a tick (its progress change times its displacement), so pushes add up; one with a stop foe is cut at that foe's contact gap. A lunge belongs to its swing (`cancelSwing` and the strike end it), a step-in to its wind-up (its landing finishes it at once, unprojected), and a cast no longer clears the others, so a recoil runs on through the next cast; a dodge clears them all. The rule "a swing waits for a push to finish" goes, from the swing gate and the manual tap's no-ageing rule. The movement itself keeps today's rules in this task (a running push still stops the steering, and the rooting stays): Task 3 blends them. The DPS sim holds the hero at its start plus what its running pushes have moved it, which gives the same grid (Task 7 checks it).

**Files:**
- Modify: `packages/engine/tests/delve-weapon-flow.test.ts:3,62` (the pushes)
- Modify: `packages/engine/tests/delve-combat-weight.test.ts:16,152,165,196,289,317,330,344,353,699,759` (the push tests and every read of `hero.push`; "the sword waits for a bolt's recoil", now false; "an automatic swing on the move waits out an ability's push", likewise)
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:424,511,561,577` (they time off `hero.push === null`)
- Modify: `packages/engine/tests/delve-training.test.ts:602,619` (the respawn test builds a push)
- Modify: `packages/engine/src/types/arpg.ts:287,363`
- Modify: `packages/engine/src/arpg/action.ts:1,66,102`
- Modify: `packages/engine/src/arpg/basic.ts:6,112,166,258`
- Modify: `packages/engine/src/arpg/abilities/cast.ts:5,119,138,164,185,318`
- Modify: `packages/engine/src/arpg/step.ts:37,198,230`
- Modify: `packages/engine/src/arpg/dodge.ts:37`, `packages/engine/src/arpg/world.ts:22,213,261`, `packages/engine/src/arpg/sandbox.ts:282`
- Modify: `packages/engine/src/arpg/dps-sim.ts:134`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-weapon-flow.test.ts` (the imports, then a new `describe` at the end):

Replace:
```ts
import { MOVE_KINDS } from '../src/types/ability.js';
import { bal, gear, registry } from './fixtures/arena.js';
```
with:
```ts
import { startPush } from '../src/arpg/action.js';
import { makeCtx } from '../src/arpg/combat.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgWorld, Vec } from '../src/types/arpg.js';
import { arena, bal, dummy, gear, pressOnly, registry, run, STEP } from './fixtures/arena.js';
```

After:
```ts
    expect(computeHeroStats({}, registry).weapon.sway).toBe('alternate');
  });
});
```
add:
```ts

/** Put the first foe `gap` units from the hero's edge along `dir` (default straight up). */
function place(w: ArpgWorld, gap: number, dir: Vec = { x: 0, y: -1 }, i = 0): void {
  const m = w.monsters[i];
  const d = w.hero.radius + m.radius + gap;
  m.x = w.hero.x + dir.x * d;
  m.y = w.hero.y + dir.y * d;
}
const kinds = (w: ArpgWorld) => w.hero.pushes.map((p) => p.kind);

describe('pushes', () => {
  it('the next cast keeps a running step; a cancelled swing takes only its own lunge', () => {
    const w = arena([dummy(13, 0)], { primary: { form: 'strike' } });
    place(w, 1.0);
    run(w, STEP);
    expect(kinds(w)).toEqual(['lunge']);
    startPush(makeCtx(registry, w, []), 'step', { x: 1, y: 0 }, 0.5, 0.5);
    pressOnly(w, 0, { x: 13, y: 20 });
    expect(w.hero.swing).toBeNull();
    expect(kinds(w)).toEqual(['step', 'stepIn']);
  });

  it('pushes add up, each by its own progress', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const { x: x0, y: y0 } = w.hero;
    startPush(ctx, 'step', { x: 1, y: 0 }, 0.4, 4 * STEP);
    startPush(ctx, 'step', { x: 0, y: -1 }, 0.2, 2 * STEP);
    run(w, 2 * STEP);
    expect(w.hero.x - x0).toBeCloseTo(0.2, 5);
    expect(y0 - w.hero.y).toBeCloseTo(0.2, 5);
    expect(w.hero.pushes).toHaveLength(1);
    run(w, 2 * STEP);
    expect(w.hero.x - x0).toBeCloseTo(0.4, 5);
    expect(w.hero.pushes).toEqual([]);
  });
});
```

In `packages/engine/tests/delve-combat-weight.test.ts` (the push tests take a kind and read `pushes`; every other read of `hero.push` too, which would otherwise pass vacuously; the two tests the list makes false are rewritten: a swing no longer waits for a push, and a recoil still covers its distance, now as `movedY`):

Replace:
```ts
import { pushTick, startPush } from '../src/arpg/action.js';
import { dist } from '../src/arpg/geometry.js';
```
with:
```ts
import { pushesTick, startPush } from '../src/arpg/action.js';
import { dist } from '../src/arpg/geometry.js';
```

Replace:
```ts
    startPush(ctx, { x: 0, y: -1 }, 0.3, STEP / 2);
    w.t += STEP;
    expect(pushTick(ctx)).toBe(true);
    expect(y0 - w.hero.y).toBeCloseTo(0.3, 5);
    expect(w.hero.push).toBeNull();
```
with:
```ts
    startPush(ctx, 'step', { x: 0, y: -1 }, 0.3, STEP / 2);
    w.t += STEP;
    pushesTick(ctx, null);
    expect(y0 - w.hero.y).toBeCloseTo(0.3, 5);
    expect(w.hero.pushes).toEqual([]);
```

Replace:
```ts
    startPush(ctx, { x: 0, y: -1 }, 2, 0.2, m.id);
    for (let i = 0; i < 10; i++) {
      w.t += STEP;
      pushTick(ctx);
    }
    const gap = Math.abs(w.hero.y - m.y) - m.radius - w.hero.radius;
    expect(gap).toBeCloseTo(bal.feel.contactGap, 4);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 4);
    expect(w.hero.push).toBeNull();
```
with:
```ts
    startPush(ctx, 'lunge', { x: 0, y: -1 }, 2, 0.2, m.id);
    for (let i = 0; i < 10; i++) {
      w.t += STEP;
      pushesTick(ctx, null);
    }
    const gap = Math.abs(w.hero.y - m.y) - m.radius - w.hero.radius;
    expect(gap).toBeCloseTo(bal.feel.contactGap, 4);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 4);
    expect(w.hero.pushes).toEqual([]);
```

Replace:
```ts
    const lunge = w.hero.push!;
    until(w, () => w.t >= lunge.start + 2 * STEP);
    expect(w.hero.push?.stopId).toBe(w.monsters[0].id);
    const y1 = w.hero.y;
    expect(y0 - y1).toBeGreaterThan(0);
    w.monsters[0].dead = true;
    until(w, () => w.hero.swing === null);
    expect(w.hero.y).toBe(y1);
    expect(w.hero.push).toBeNull();
```
with:
```ts
    const [lunge] = w.hero.pushes;
    until(w, () => w.t >= lunge.start + 2 * STEP);
    expect(w.hero.pushes).toEqual([lunge]);
    expect(lunge).toMatchObject({ kind: 'lunge', stopId: w.monsters[0].id });
    const y1 = w.hero.y;
    expect(y0 - y1).toBeGreaterThan(0);
    w.monsters[0].dead = true;
    until(w, () => w.hero.swing === null);
    expect(w.hero.y).toBe(y1);
    expect(w.hero.pushes).toEqual([]);
```

Replace:
```ts
    expect(w.hero.push).not.toBeNull();
    const x0 = w.hero.x;
    const y0 = w.hero.y;
    const right = { move: { x: 1, y: 0 } };
    stepWorld(registry, w, right, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    expect(w.hero.push).toBeNull();
```
with:
```ts
    expect(w.hero.pushes).toHaveLength(1);
    const x0 = w.hero.x;
    const y0 = w.hero.y;
    const right = { move: { x: 1, y: 0 } };
    stepWorld(registry, w, right, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    expect(w.hero.pushes).toEqual([]);
```

Replace:
```ts
    expect(w.hero.push).toBeNull();
    events.push(...run(w, sw.strikeAt - w.t + 0.1));
```
with:
```ts
    expect(w.hero.pushes).toEqual([]);
    events.push(...run(w, sw.strikeAt - w.t + 0.1));
```

Replace:
```ts
    expect(w.hero.push).toBeNull();
    const x0 = w.hero.x;
```
with:
```ts
    expect(w.hero.pushes).toEqual([]);
    const x0 = w.hero.x;
```

Replace:
```ts
    expect(w.hero.push).toBeNull();
    // Past the strike: no recovery slow.
```
with:
```ts
    expect(w.hero.pushes).toEqual([]);
    // Past the strike: no recovery slow.
```

Replace:
```ts
  it("an automatic swing on the move waits out an ability's push and keeps its recovery", () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    const y0 = w.hero.y;
    startPush(makeCtx(registry, w, []), { x: 0, y: 1 }, 0.1, 0.1);
    // The recovery outlasts the push and the shot, so the shot's start and strike leave it alone.
    const recoverUntil = (w.hero.recoverUntil = w.t + 0.5);
    const move = { move: { x: 1, y: 0 } };
    until(w, () => w.hero.swing !== null, move);
    expect(w.hero.push).toBeNull();
    expect(w.hero.swing!.committed).toBe(false);
```
with:
```ts
  it("an automatic swing on the move doesn't wait for a push, and keeps an ability's recovery", () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    const y0 = w.hero.y;
    startPush(makeCtx(registry, w, []), 'step', { x: 0, y: 1 }, 0.1, 0.1);
    // The recovery outlasts the push and the shot, so the shot's start and strike leave it alone.
    const recoverUntil = (w.hero.recoverUntil = w.t + 0.5);
    const move = { move: { x: 1, y: 0 } };
    stepWorld(registry, w, move, STEP);
    expect(w.hero.swing!.committed).toBe(false);
    expect(w.hero.pushes).toHaveLength(1);
    until(w, () => w.hero.pushes.length === 0, move);
```

Replace:
```ts
  it("with basics on, the sword waits for a bolt's recoil to finish before it swings", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const y0 = w.hero.y;
    const bolt = moveOf(w, 0);
    press(w, 0);
    // The recoil pushes the hero back (away from the foe above), and nothing swings meanwhile.
    const recoil = w.hero.push!;
    expect(recoil.dy).toBeGreaterThan(0);
    expect(w.hero.swing).toBeNull();
    until(w, () => w.hero.push !== recoil);
    expect(w.hero.y - y0).toBeCloseTo(-bolt.motion, 5);
    // Then the sword swings again.
    until(w, () => w.hero.swing !== null);
    expect(w.hero.swing!.start).toBeGreaterThanOrEqual(recoil.until - 1e-9);
```
with:
```ts
  it("with basics on, the sword swings through a bolt's recoil, which still covers its distance", () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const bolt = moveOf(w, 0);
    press(w, 0);
    // The recoil pushes the hero back (away from the foe above); the sword swings at once.
    const recoil = w.hero.pushes.find((p) => p.kind === 'step')!;
    expect(recoil.dy).toBeGreaterThan(0);
    expect(w.hero.swing!.start).toBeLessThan(recoil.until);
    until(w, () => !w.hero.pushes.includes(recoil));
    expect(recoil.movedY).toBeCloseTo(-bolt.motion, 5);
```

Replace:
```ts
    // Its own step-in survives the cancel.
    expect(w.hero.push).not.toBeNull();
  });
```
with:
```ts
    // The swing's lunge goes with it; the strike's own step-in runs.
    expect(w.hero.pushes.map((p) => p.kind)).toEqual(['stepIn']);
  });
```

In `packages/engine/tests/delve-chain-feel.test.ts` (four waits for the Bolt's recoil to end):

Replace:
```ts
    watch(fits, () => fits.hero.push === null); // the Bolt's recoil
    expect(end - fits.t).toBeGreaterThan(startup(fits) + STEP);
```
with:
```ts
    watch(fits, () => fits.hero.pushes.length === 0); // the Bolt's recoil
    expect(end - fits.t).toBeGreaterThan(startup(fits) + STEP);
```

Replace:
```ts
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.push === null);
    // A swing starts, then Q is pressed with its move cooling.
```
with:
```ts
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.pushes.length === 0);
    // A swing starts, then Q is pressed with its move cooling.
```

Replace:
```ts
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.push === null);
    // The press ages from now; its move cools just past its buffer, before the maul's blow.
```
with:
```ts
    watch(w, () => !inBeat(w.hero, 0, w.t) && w.hero.pushes.length === 0);
    // The press ages from now; its move cools just past its buffer, before the maul's blow.
```

Replace:
```ts
    watch(w, () => w.hero.push === null, manual);
    // Held back from now to the beat's end: longer than the buffer.
```
with:
```ts
    watch(w, () => w.hero.pushes.length === 0, manual);
    // Held back from now to the beat's end: longer than the buffer.
```

In `packages/engine/tests/delve-training.test.ts` (the respawn test):

Replace:
```ts
    h.push = { fromX: 13, fromY: 26, dx: 0, dy: -1, start: 0, until: 1, stopId: null };
    h.recoverUntil = w.t + 5;
```
with:
```ts
    h.pushes = [
      {
        kind: 'step',
        dx: 0,
        dy: -1,
        start: 0,
        until: 1,
        stopId: null,
        done: 0,
        movedX: 0,
        movedY: 0,
      },
    ];
    h.recoverUntil = w.t + 5;
```

Replace:
```ts
      push: null,
      dodge: null,
```
with:
```ts
      pushes: [],
      dodge: null,
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-combat-weight.test.ts tests/delve-training.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 17 failed, 124 passed (141): both `pushes` tests; "respawn restores the hero where it fell and clears its action state"; in `delve-combat-weight`, the three `pushes and buffered input` push tests, "moving releases an automatic swing…", "an automatic swing whose foe dies…", "a committed shot roots the hero…", "automatic swings on the move neither root, lunge nor slow", "an automatic swing on the move doesn't wait for a push…", "with basics on, the sword swings through a bolt's recoil…" and "a press cancels a swing startup only when the cast goes ahead"; in `delve-chain-feel`, the four tests that wait for the recoil (they read `pushes`, which doesn't exist yet).

- [ ] **Step 3: The types**

In `packages/engine/src/types/arpg.ts`:

Before:
```ts
export interface HeroEntity {
```
add:
```ts
/**
 * What made a push, which decides what ends it: `lunge` a swing's (a hold
 * blow's leap too), `stepIn` a form's over its conjure, `step` a blow's step
 * after its strike or a form's recoil (see the weapon flow spec).
 */
export type PushKind = 'lunge' | 'stepIn' | 'step';

/**
 * Motion an action adds on top of the steering: `dx`, `dy` (its direction
 * times its distance) from `start` to `until`, each tick's slice by its
 * progress (`done`, 0..1). `movedX`, `movedY` are what it has actually
 * moved the hero, after the steering's projection, clamping and cuts.
 */
export interface Push {
  kind: PushKind;
  dx: number;
  dy: number;
  start: number;
  until: number;
  /** Stop at this foe's contact gap (a lunge, a step-in), or null. */
  stopId: number | null;
  done: number;
  movedX: number;
  movedY: number;
}

```

Replace:
```ts
  /** Motion an action imposes (a lunge, a step-in or a recoil), placed by progress; it replaces move input. */
  push: {
    fromX: number;
    fromY: number;
    dx: number;
    dy: number;
    start: number;
    until: number;
    /** Stop at this foe's edge (a lunge), or null. */
    stopId: number | null;
  } | null;
  /** Movement is slowed until this time (after a strike or a landed ability). */
```
with:
```ts
  /** Each running push (a lunge, a step-in, a step or a recoil), in the order they began. */
  pushes: Push[];
  /** Movement is slowed until this time (after a strike or a landed ability). */
```

- [ ] **Step 4: Pushes as slices**

In `packages/engine/src/arpg/action.ts` (the module comment, `startPush`, `endPushes`, `slice` for `pushTick`, `pushesTick`, `finishPushes`, and `cancelSwing`):

Replace:
```ts
import type { ArpgWorld, HeroEntity, Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp } from './geometry.js';
import { chargeCap } from './abilities/resolve.js';

/**
 * Motion and cancels for the hero's actions. A push (a lunge, an ability's
 * step-in or a recoil) is placed by progress like the dodge's dash, so even
 * a push shorter than one tick covers its distance, and a lunge stops at
 * the edge of the foe it lunges at.
 */

/**
 * Move the hero `distance` units along `dir` over `seconds`, after holding it
 * in place for `delay` seconds; with `stopId`, stop at that foe.
 */
export function startPush(
  ctx: SimCtx,
  dir: Vec,
  distance: number,
  seconds: number,
  stopId: number | null = null,
  delay = 0,
): void {
  const h = ctx.world.hero;
  const start = ctx.world.t + delay;
  h.push = {
    fromX: h.x,
    fromY: h.y,
    dx: dir.x * distance,
    dy: dir.y * distance,
    start,
    until: start + Math.max(1e-6, seconds),
    stopId,
  };
```
with:
```ts
import type { ArpgWorld, HeroEntity, Push, PushKind, Vec } from '../types/arpg.js';
import type { SimCtx } from './combat.js';
import { clamp } from './geometry.js';
import { chargeCap } from './abilities/resolve.js';

/**
 * Motion and cancels for the hero's actions. Each push (a lunge, a form's
 * step-in, a blow's step or a form's recoil) adds a slice of its displacement
 * each tick, by its progress like the dodge's dash, so even a push shorter
 * than one tick covers its distance; one with a stop foe ends at that foe's
 * contact gap (see the weapon flow spec).
 */

/**
 * Start a push of `kind`: `distance` units along `dir` over `seconds`, after
 * `delay` seconds with no slice (a lunge's planted part); with `stopId`, it
 * stops at that foe's contact gap. Other pushes keep running.
 */
export function startPush(
  ctx: SimCtx,
  kind: PushKind,
  dir: Vec,
  distance: number,
  seconds: number,
  stopId: number | null = null,
  delay = 0,
): void {
  const start = ctx.world.t + delay;
  ctx.world.hero.pushes.push({
    kind,
    dx: dir.x * distance,
    dy: dir.y * distance,
    start,
    until: start + Math.max(1e-6, seconds),
    stopId,
    done: 0,
    movedX: 0,
    movedY: 0,
  });
}

/** End the hero's pushes of `kind`; the others keep running. */
export function endPushes(h: HeroEntity, kind: PushKind): void {
  h.pushes = h.pushes.filter((p) => p.kind !== kind);
```

Replace:
```ts
 * Carry the push; true while it moves (or holds) the hero this step.
 * `finish` jumps to its end (a wind-up landing finishes its step-in first).
 */
export function pushTick(ctx: SimCtx, finish = false): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const p = h.push;
  if (!p) return false;
  const foe = p.stopId === null ? null : world.monsters.find((m) => m.id === p.stopId && !m.dead);
  // A lunge whose foe is gone ends at once.
  if (p.stopId !== null && !foe) {
    h.push = null;
    return false;
  }
  // Before its start (a lunge's hold) it keeps the hero where it began.
  const k = finish ? 1 : Math.min(1, Math.max(0, (world.t - p.start) / (p.until - p.start)));
  const x = clamp(p.fromX + p.dx * k, h.radius, world.width - h.radius);
  const y = clamp(p.fromY + p.dy * k, h.radius, world.height - h.radius);
  const c = foe
    ? contactAt(h.x, h.y, x, y, foe.x, foe.y, foe.radius + h.radius + bal.feel.contactGap)
    : 1;
  // Stop exactly at the contact gap, never inside it.
  h.x += (x - h.x) * c;
  h.y += (y - h.y) * c;
  if (c < 1 || k >= 1) h.push = null;
  return true;
```
with:
```ts
 * Move the hero by push `p`'s slice up to progress `k`: less the part that
 * points against the steering `steer` (a unit vector; null when not steering),
 * clamped to the arena, and cut at its stop foe's contact gap. Returns whether
 * it runs on: it ends when its progress runs out, its foe is gone, or it
 * reaches the gap (at once if the hero is already inside it).
 */
function slice(ctx: SimCtx, p: Push, k: number, steer: Vec | null): boolean {
  const { world, bal } = ctx;
  const h = world.hero;
  const foe = p.stopId === null ? null : world.monsters.find((m) => m.id === p.stopId && !m.dead);
  if (p.stopId !== null && !foe) return false;
  let dx = p.dx * (k - p.done);
  let dy = p.dy * (k - p.done);
  p.done = k;
  const against = steer ? dx * steer.x + dy * steer.y : 0;
  if (steer && against < 0) {
    dx -= against * steer.x;
    dy -= against * steer.y;
  }
  const x = clamp(h.x + dx, h.radius, world.width - h.radius);
  const y = clamp(h.y + dy, h.radius, world.height - h.radius);
  const c = foe
    ? contactAt(h.x, h.y, x, y, foe.x, foe.y, foe.radius + h.radius + bal.feel.contactGap)
    : 1;
  // Stop exactly at the contact gap, never inside it.
  p.movedX += (x - h.x) * c;
  p.movedY += (y - h.y) * c;
  h.x += (x - h.x) * c;
  h.y += (y - h.y) * c;
  return c >= 1 && k < 1;
}

/**
 * Carry every push one tick, in the order they began: each adds its slice
 * (none before its start: a lunge's planted part), less the part against the
 * steering `steer` (a unit vector, or null).
 */
export function pushesTick(ctx: SimCtx, steer: Vec | null): void {
  const { world } = ctx;
  const h = world.hero;
  h.pushes = h.pushes.filter((p) =>
    slice(ctx, p, Math.min(1, Math.max(0, (world.t - p.start) / (p.until - p.start))), steer),
  );
}

/**
 * Finish the hero's pushes of `kind` at once (a wind-up landing: its
 * step-in), unprojected, still cut at a stop foe's contact gap.
 */
export function finishPushes(ctx: SimCtx, kind: PushKind): void {
  const h = ctx.world.hero;
  for (const p of h.pushes) if (p.kind === kind) slice(ctx, p, 1, null);
  endPushes(h, kind);
```

Replace:
```ts
/** Drop a basic swing still in its startup: no blow, no string step, and the weapon is ready again. */
export function cancelSwing(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.swing) return;
  h.swing = null;
  h.push = null;
```
with:
```ts
/** Drop a basic swing still in its startup (and its lunge): no blow, no string step, and the weapon is ready again. */
export function cancelSwing(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.swing) return;
  h.swing = null;
  endPushes(h, 'lunge');
```

- [ ] **Step 5: Each push's kind; a cast clears none**

In `packages/engine/src/arpg/basic.ts` (the lunge; the strike ends it; the ranged recoil stays a committed shot's, over `recoilSeconds`, until Task 5):

Replace:
```ts
import { startPush } from './action.js';
import { holdCharge } from './abilities/cast.js';
```
with:
```ts
import { endPushes, startPush } from './action.js';
import { holdCharge } from './abilities/cast.js';
```

Replace:
```ts
    startPush(ctx, dir, lunge, startup - hold, foe?.id ?? null, hold);
  }
```
with:
```ts
    startPush(ctx, 'lunge', dir, lunge, startup - hold, foe?.id ?? null, hold);
  }
```

Replace:
```ts
  // The lunge belongs to the swing and ends with it (no other push runs during a swing).
  h.push = null;
  const last = sw.step === w.blows.length - 1;
```
with:
```ts
  // The lunge belongs to the swing and ends with it.
  endPushes(h, 'lunge');
  const last = sw.step === w.blows.length - 1;
```

Replace:
```ts
      startPush(ctx, { x: -dir.x, y: -dir.y }, -s.move, bal.feel.recoilSeconds);
  }
```
with:
```ts
      startPush(ctx, 'step', { x: -dir.x, y: -dir.y }, -s.move, bal.feel.recoilSeconds);
  }
```

In `packages/engine/src/arpg/abilities/cast.ts` (the recoil and the step-in take their kinds; `castAbility` and `startHold` stop clearing pushes, since `cancelSwing` ends the swing's lunge; `castTick` finishes its step-in):

Replace:
```ts
import { cancelSwing, pushTick, startPush, swingStrikes } from '../action.js';
import { dirTo, dist } from '../geometry.js';
```
with:
```ts
import { cancelSwing, finishPushes, startPush, swingStrikes } from '../action.js';
import { dirTo, dist } from '../geometry.js';
```

Replace:
```ts
      startPush(ctx, { x: -d.x, y: -d.y }, -ab.motion * size, bal.feel.recoilSeconds);
  }
```
with:
```ts
      startPush(ctx, 'step', { x: -d.x, y: -d.y }, -ab.motion * size, bal.feel.recoilSeconds);
  }
```

Replace:
```ts
 * and the chain doesn't advance) or with nothing to aim at. Otherwise it pays now, drops a basic swing still winding up, and winds
 * up for its conjure (stepping in, for forward forms) plus any channel; its
 * cooldown counts from the press plus the channel.
 */
```
with:
```ts
 * and the chain doesn't advance) or with nothing to aim at. Otherwise it pays
 * now, drops a basic swing still winding up (with its lunge: other pushes,
 * such as a blow's step, run on), and winds up for its conjure (stepping in,
 * for forward forms) plus any channel; its cooldown counts from the press plus
 * the channel.
 */
```

Replace:
```ts
  h.push = null;
  h.recoverUntil = t;
  const chargePaid = chain.payment === 'charge' ? ab.chargeNeed : 0;
```
with:
```ts
  h.recoverUntil = t;
  const chargePaid = chain.payment === 'charge' ? ab.chargeNeed : 0;
```

Replace:
```ts
    startPush(ctx, dir, reach, ab.conjure, stop?.id ?? null);
  }
```
with:
```ts
    startPush(ctx, 'stepIn', dir, reach, ab.conjure, stop?.id ?? null);
  }
```

Replace:
```ts
  h.push = null;
  h.recoverUntil = t;
```
with:
```ts
  h.recoverUntil = t;
```

Replace:
```ts
  pushTick(ctx, true);
  if (!fire(ctx, slot, aim, step, stage)) fire(ctx, slot, at, step, stage);
```
with:
```ts
  finishPushes(ctx, 'stepIn');
  if (!fire(ctx, slot, aim, step, stage)) fire(ctx, slot, at, step, stage);
```

- [ ] **Step 6: The tick**

In `packages/engine/src/arpg/step.ts` (an automatic swing moved off still drops its lunge, as today; a running push still stops the steering, `pushed` read before the tick's slices, which Task 3 replaces; a swing and a tap no longer wait for a push):

Replace:
```ts
import { cancelSwing, dropHold, pushTick, swingStrikes } from './action.js';
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';
```
with:
```ts
import { cancelSwing, dropHold, endPushes, pushesTick, swingStrikes } from './action.js';
import { dodgeTick, isDashing, notePerfect, perfectOrigin, tryDodge } from './dodge.js';
```

Replace:
```ts
      h.push = null;
    }
  }

  // Movement: a push carries the hero; a wind-up, a hold or a committed swing roots it; a
  // recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && pushTick(ctx);
```
with:
```ts
      endPushes(h, 'lunge');
    }
  }

  // Movement: a push carries the hero; a wind-up, a hold or a committed swing roots it; a
  // recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && h.pushes.length > 0;
  if (pushed) pushesTick(ctx, null);
```

Replace:
```ts
  // A tap held by a dash, a wind-up, a hold, a swing, a push, the weapon's cycle or a waiting
  // press doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || h.push || t < h.nextAttackAt || due !== Infinity)
  )
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  // A swing waits for a push (a lunge, a step-in or a recoil) to finish, so it never swallows one.
  if (!h.swing && !h.windup && !h.hold && !h.push && !dashing) {
```
with:
```ts
  // A tap held by a dash, a wind-up, a hold, a swing, the weapon's cycle or a waiting press
  // doesn't age either.
  if (
    world.queuedAttack &&
    (dashing || h.windup || h.hold || h.swing || t < h.nextAttackAt || due !== Infinity)
  )
    world.queuedAttack.until = Math.max(world.queuedAttack.until, t + bal.feel.buffer);
  if (!h.swing && !h.windup && !h.hold && !dashing) {
```

- [ ] **Step 7: The dodge, a new hero, a refresh and a respawn**

In `packages/engine/src/arpg/dodge.ts` (`tryDodge`):

Replace:
```ts
  h.push = null;
  h.recoverUntil = t;
```
with:
```ts
  h.pushes = [];
  h.recoverUntil = t;
```

In `packages/engine/src/arpg/world.ts` (the import, `createHeroEntity`, and `refreshWorldHero`: a weapon swap ends the swing's lunge, a changed chain's wind-up its step-in):

Replace:
```ts
import { cancelWindup, clearBeat, dropHold } from './action.js';
import { dist } from './geometry.js';
```
with:
```ts
import { cancelWindup, clearBeat, dropHold, endPushes } from './action.js';
import { dist } from './geometry.js';
```

Replace:
```ts
    push: null,
    recoverUntil: 0,
```
with:
```ts
    pushes: [],
    recoverUntil: 0,
```

Replace:
```ts
      h.push = null;
    }
    h.attackCount = 0;
    h.nextAttackAt = Math.min(h.nextAttackAt, world.t);
  }
  const changed = ABILITY_SLOTS.map((slot, i) => !sameChain(h.chains[i], chains[slot]));
  if (h.windup && changed[h.windup.slot]) {
    cancelWindup(h, world.t);
    h.push = null; // its step-in goes with it
```
with:
```ts
      endPushes(h, 'lunge');
    }
    h.attackCount = 0;
    h.nextAttackAt = Math.min(h.nextAttackAt, world.t);
  }
  const changed = ABILITY_SLOTS.map((slot, i) => !sameChain(h.chains[i], chains[slot]));
  if (h.windup && changed[h.windup.slot]) {
    cancelWindup(h, world.t);
    endPushes(h, 'stepIn'); // its step-in goes with it
```

In `packages/engine/src/arpg/sandbox.ts` (`respawnHero`):

Replace:
```ts
  h.push = null;
  h.recoverUntil = t;
```
with:
```ts
  h.pushes = [];
  h.recoverUntil = t;
```

- [ ] **Step 8: The DPS sim's held position**

In `packages/engine/src/arpg/dps-sim.ts` (`simulateDps`):

Replace:
```ts
      // Positions are held: knockback, pulls and pushes never drift anyone out of reach. A push
      // begun in the tick another ended starts from that push's end, so the hero sits at most one
      // push-length off `start` for its duration (a lunge still clamps at contact).
      h.x = start.x;
      h.y = start.y;
      for (const m of dummies) {
```
with:
```ts
      // Positions are held: knockback, pulls and pushes never drift anyone out of reach. The hero
      // goes back to its start plus what its running pushes have moved it, so a lunge still plays
      // out (stopping at contact) and the hero is back at its start once they end.
      h.x = start.x + h.pushes.reduce((a, p) => a + p.movedX, 0);
      h.y = start.y + h.pushes.reduce((a, p) => a + p.movedY, 0);
      for (const m of dummies) {
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-combat-weight.test.ts tests/delve-training.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 141 passed.

- [ ] **Step 10: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1317 tests pass in 76 files.

- [ ] **Step 11: Commit**

First check `git diff packages/engine/tests/delve-chain-feel.test.ts` shows only the four `pushes.length` lines (see "One stray byte").

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/dps-sim.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-chain-feel.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/dps-sim.ts
git commit -m "feat(engine): pushes become a list of slices; a cast keeps them and a swing no longer waits for one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 3: Engine: no rooting

### Task 3: The steering blends with every push; acting slows the hero and faces the action

The movement block becomes the spec's "one movement per tick": the hero moves by its steering at its pace, slowed to `actionMove` while a swing (startup to strike), a charging hold blow, a wind-up or a charging hold runs (a recovery's slower `recoveryMove` wins), then every push adds its slice, the part against the steering dropped. Nothing roots. While it acts the hero faces the action (a swing's direction, a wind-up's `windupDir`, a hold's aim), so steering strafes; else it faces its steering. `h.moving` is steering and not dashing. Moving during an automatic swing's startup still clears `committed`, but only for the recovery: its lunge runs on. `HeroEntity.windup` gains `from`, which Task 4's rule past the aim point reads; here `windupDir` faces a wind-up toward its `at` (or keeps the facing for a self-centred form).

**Files:**
- Modify: `packages/engine/tests/delve-weapon-flow.test.ts:5,77,102` (blending, no rooting, facing)
- Modify: `packages/engine/tests/delve-combat-weight.test.ts:264,285,327` (a manual swing, a moving automatic swing, a committed shot, automatic swings on the move: slowed, not rooted)
- Modify: `packages/engine/tests/ability-cast.test.ts:60,72` (the wind-up roots)
- Modify: `packages/engine/tests/delve-chains.test.ts:617,631` (a charging hold roots)
- Modify: `packages/engine/src/types/arpg.ts:343,375,384`
- Modify: `packages/engine/src/arpg/abilities/cast.ts:175,257,273,307`
- Modify: `packages/engine/src/arpg/basic.ts:66,94`
- Modify: `packages/engine/src/arpg/step.ts:6,30,190,262`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-weapon-flow.test.ts` (the imports, a `still` beside `kinds`, then two `describe`s at the end):

Replace:
```ts
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgWorld, Vec } from '../src/types/arpg.js';
import { arena, bal, dummy, gear, pressOnly, registry, run, STEP } from './fixtures/arena.js';
```
with:
```ts
import { dirTo } from '../src/arpg/geometry.js';
import { stepWorld } from '../src/arpg/step.js';
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import {
  arena,
  bal,
  dummy,
  gear,
  moveOf,
  press,
  pressOnly,
  registry,
  run,
  STEP,
  strikeWorld,
} from './fixtures/arena.js';
```

Before:
```ts

describe('pushes', () => {
```
add:
```ts
const still = { x: 0, y: 0 };
```

After:
```ts
    expect(w.hero.pushes).toEqual([]);
  });
});
```
add:
```ts

describe('blending', () => {
  const down = { x: 0, y: 1 };

  it('a lunge steered away from moves the hero only along the steering', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    run(w, STEP);
    const [lunge] = w.hero.pushes;
    expect(lunge.kind).toBe('lunge');
    const { x: x0, y: y0 } = w.hero;
    let n = 0;
    for (; w.hero.swing && n < 60; n++) stepWorld(registry, w, { move: down }, STEP);
    expect(w.hero.x).toBe(x0);
    expect(w.hero.y - y0).toBeCloseTo(n * w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 5);
    expect(lunge.movedY).toBeCloseTo(0, 9);
  });

  it('a sideways part survives; exactly against the steering, a push expires', () => {
    const w = arena([], { noBasic: true });
    const ctx = makeCtx(registry, w, []);
    const { x: x0, y: y0 } = w.hero;
    startPush(ctx, 'step', { x: -0.6, y: -0.8 }, 1, 4 * STEP);
    startPush(ctx, 'step', { x: 0, y: -1 }, 1, 4 * STEP);
    run(w, 4 * STEP, down);
    expect(x0 - w.hero.x).toBeCloseTo(0.6, 5);
    expect(w.hero.y - y0).toBeCloseTo(4 * w.hero.stats.moveSpeed * STEP, 5);
    expect(w.hero.pushes).toEqual([]);
  });

  it("a form's step-in and recoil blend with the steering", () => {
    // A Strike aimed straight up steps in over its conjure, square to the hero strafing right.
    const s = arena([dummy(13, 20)], { noBasic: true, primary: { form: 'strike' } });
    const { x: x0, y: y0 } = s.hero;
    pressOnly(s, 0, { x: 13, y: 20 });
    for (let i = 0; i < 60 && s.hero.windup; i++)
      stepWorld(registry, s, { move: { x: 1, y: 0 } }, STEP);
    expect(y0 - s.hero.y).toBeCloseTo(moveOf(s, 0).motion, 5);
    expect(s.hero.x).toBeGreaterThan(x0);
    // A Bolt fired up recoils down, against a hero steering up: none of it applies.
    const b = arena([dummy(13, 30)], { noBasic: true });
    press(b, 0);
    const recoil = b.hero.pushes.find((p) => p.kind === 'step')!;
    const y1 = b.hero.y;
    run(b, 4 * STEP, { x: 0, y: -1 });
    expect(recoil.movedY).toBeCloseTo(0, 9);
    expect(y1 - b.hero.y).toBeCloseTo(4 * b.hero.stats.moveSpeed * STEP * bal.feel.recoveryMove, 5);
    expect(b.hero.pushes).toEqual([]);
  });
});

describe('no rooting', () => {
  const sword = { weapon: gear('fire') };
  /** How far one step steering right moves the hero, as a share of its full pace. */
  const stepRight = (w: ArpgWorld, input: Partial<ArpgInput> = {}) => {
    const x = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, ...input }, STEP);
    return (w.hero.x - x) / (w.hero.stats.moveSpeed * STEP);
  };

  it('a swing, a charging hold blow, a wind-up and a charging hold each slow the hero to actionMove', () => {
    const swing = arena([dummy(13, 34.4)]);
    run(swing, STEP);
    expect(swing.hero.swing).not.toBeNull();
    expect(stepRight(swing)).toBeCloseTo(bal.feel.actionMove, 5);

    const blow = strikeWorld(sword, { basic: [{ kind: 'hold', element: 'fire' }] });
    const held = { attack: true };
    for (let i = 0; i < 60 && blow.hero.swing?.held == null; i++)
      stepWorld(registry, blow, { move: still, ...held }, STEP);
    expect(blow.hero.swing!.held).not.toBeNull();
    expect(stepRight(blow, held)).toBeCloseTo(bal.feel.actionMove, 5);

    const cast = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(cast, 0);
    expect(cast.hero.windup).not.toBeNull();
    expect(stepRight(cast)).toBeCloseTo(bal.feel.actionMove, 5);

    const hold = arena([dummy(13, 30)], { noBasic: true, primary: { kind: 'hold' } });
    stepWorld(registry, hold, { move: still, holding: 0 }, STEP);
    expect(hold.hero.hold).not.toBeNull();
    expect(stepRight(hold, { holding: 0 })).toBeCloseTo(bal.feel.actionMove, 5);
  });

  it("a recovery's slower pace wins", () => {
    const w = arena([dummy(13, 34.4)]);
    run(w, STEP);
    expect(w.hero.swing).not.toBeNull();
    w.hero.recoverUntil = w.t + 1;
    expect(stepRight(w)).toBeCloseTo(bal.feel.recoveryMove, 5);
  });

  it('the hero faces its action while strafing, then its steering again', () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { payment: 'cast' } });
    pressOnly(w, 0);
    const at = w.hero.windup!.at;
    stepRight(w);
    expect(w.hero.facing).toEqual(dirTo(w.hero.x, w.hero.y, at.x, at.y));
    for (let i = 0; i < 60 && w.hero.windup; i++) stepRight(w);
    stepRight(w);
    expect(w.hero.facing).toEqual({ x: 1, y: 0 });

    // A hold with nothing to aim at keeps the facing it started with.
    const h = arena([], { noBasic: true, primary: { kind: 'hold' } });
    stepWorld(registry, h, { move: still, holding: 0 }, STEP);
    expect(h.hero.hold).toMatchObject({ aim: null });
    stepRight(h, { holding: 0 });
    expect(h.hero.facing).toEqual({ x: 0, y: -1 });
  });
});
```

In `packages/engine/tests/delve-combat-weight.test.ts` (three tests move at `actionMove` where they stood rooted; a moving automatic swing keeps its lunge; the first tick of a swing started on the move walks at full pace, the swing starting after the movement):

Replace:
```ts
  it('a manual swing ignores movement through its startup, then slows it in recovery only', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const right = { move: { x: 1, y: 0 }, attack: false };
    stepWorld(registry, w, { move: still, attack: false, attackTap: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    const x0 = w.hero.x;
    stepWorld(registry, w, right, STEP);
    expect(w.hero.x).toBe(x0);
    until(w, () => w.hero.swing === null, right);
    const x1 = w.hero.x;
    stepWorld(registry, w, right, STEP);
    const pace = w.hero.stats.moveSpeed * STEP;
```
with:
```ts
  it('a manual swing slows movement through its startup, then more in its recovery', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const right = { move: { x: 1, y: 0 }, attack: false };
    stepWorld(registry, w, { move: still, attack: false, attackTap: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    const x0 = w.hero.x;
    stepWorld(registry, w, right, STEP);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x0).toBeCloseTo(pace * bal.feel.actionMove, 4);
    until(w, () => w.hero.swing === null, right);
    const x1 = w.hero.x;
    stepWorld(registry, w, right, STEP);
```

Replace:
```ts
  it('moving releases an automatic swing: full speed, no more lunge, the blow still lands, no recovery', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    run(w, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.pushes).toHaveLength(1);
    const x0 = w.hero.x;
    const y0 = w.hero.y;
    const right = { move: { x: 1, y: 0 } };
    stepWorld(registry, w, right, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    expect(w.hero.pushes).toEqual([]);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x0).toBeCloseTo(pace, 4);
    expect(w.hero.y).toBe(y0);
    const events = until(w, () => w.hero.swing === null, right);
    expect(basics(events)).toHaveLength(1);
```
with:
```ts
  it('moving during an automatic swing: slowed, the lunge goes on, the blow lands, no recovery', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.6);
    const y0 = w.hero.y;
    run(w, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.pushes).toHaveLength(1);
    const x0 = w.hero.x;
    const right = { move: { x: 1, y: 0 } };
    stepWorld(registry, w, right, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    expect(w.hero.pushes).toHaveLength(1);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x0).toBeCloseTo(pace * bal.feel.actionMove, 4);
    expect(w.hero.y).toBe(y0);
    const events = until(w, () => w.hero.swing === null, right);
    expect(basics(events)).toHaveLength(1);
    // The lunge, straight up, is square to the steering: all of it applies.
    expect(y0 - w.hero.y).toBeCloseTo(w.hero.stats.weapon.blows[0].move, 2);
```

Replace:
```ts
  it('a committed shot roots the hero through its startup, with no push involved', () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    stepWorld(registry, w, { move: still, attack: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.pushes).toEqual([]);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, attack: true }, STEP);
    expect(w.hero.x).toBe(x0);
  });

  it('automatic swings on the move neither root, lunge nor slow', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.x - x0).toBeCloseTo(2 * w.hero.stats.moveSpeed * STEP, 4);
```
with:
```ts
  it('a committed shot slows the hero through its startup, facing its aim', () => {
    const w = arena([dummy(13, 30)], { equipped: { weapon: gear('fire', 'weapon', 'wand') } });
    stepWorld(registry, w, { move: still, attack: true }, STEP);
    expect(w.hero.swing?.committed).toBe(true);
    expect(w.hero.pushes).toEqual([]);
    const x0 = w.hero.x;
    stepWorld(registry, w, { move: { x: 1, y: 0 }, attack: true }, STEP);
    expect(w.hero.x - x0).toBeCloseTo(w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 4);
    expect(w.hero.facing).toEqual(w.hero.swing!.dir);
  });

  it('automatic swings on the move walk slowed and leave no recovery', () => {
    const w = arena([dummy(13, 0)]);
    place(w, 1.0);
    const x0 = w.hero.x;
    // The first tick walks at full pace, then the swing starts.
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing?.committed).toBe(false);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    const pace = w.hero.stats.moveSpeed * STEP;
    expect(w.hero.x - x0).toBeCloseTo(pace * (1 + bal.feel.actionMove), 4);
```

In `packages/engine/tests/ability-cast.test.ts`:

Replace:
```ts
  it('roots the hero through the wind-up, lands after it and blocks other casts', () => {
    const w = arena([dummy(11, 36), dummy(13, 30)], {
```
with:
```ts
  it('slows the hero through the wind-up, lands after it and blocks other casts', () => {
    const w = arena([dummy(11, 36), dummy(13, 30)], {
```

Replace:
```ts
    expect(w.hero.y).toBe(y);
    expect(w.projectiles).toHaveLength(0);
```
with:
```ts
    expect(y - w.hero.y).toBeCloseTo(w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 5);
    expect(w.projectiles).toHaveLength(0);
```

In `packages/engine/tests/delve-chains.test.ts` (the hold starts before the movement in its first tick, so both ticks walk slowed):

Replace:
```ts
  it('holding starts a charge only when the next move is a hold: rooted, and paying nothing yet', () => {
    const plain = holder([m('medium')]);
```
with:
```ts
  it('holding starts a charge only when the next move is a hold: walking slowed, and paying nothing yet', () => {
    const plain = holder([m('medium')]);
```

Replace:
```ts
    expect(w.hero.x).toBe(x);
    expect(w.hero.mana).toBe(mana);
```
with:
```ts
    expect(w.hero.x - x).toBeCloseTo(2 * w.hero.stats.moveSpeed * STEP * bal.feel.actionMove, 5);
    expect(w.hero.mana).toBe(mana);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/ability-cast.test.ts tests/delve-chains.test.ts tests/delve-combat-weight.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 11 failed, 121 passed (132): "slows the hero through the wind-up…" (ability-cast); the three `blending` tests; "a swing, a charging hold blow, a wind-up and a charging hold each slow the hero to actionMove" and "the hero faces its action while strafing…" (`no rooting`; its "a recovery's slower pace wins" already passes: today an automatic swing moved off is released at full pace times the recovery's); in `delve-combat-weight`, "a manual swing slows movement…", "moving during an automatic swing…", "a committed shot slows the hero…" and "automatic swings on the move walk slowed…"; "holding starts a charge only when the next move is a hold: walking slowed…" (delve-chains).

- [ ] **Step 3: The types**

In `packages/engine/src/types/arpg.ts` (`windup.from`, and the comments that said the hero roots):

Replace:
```ts
  /** An ability winding up (every ability conjures; cast payment channels too); the hero can't walk or attack meanwhile (a forward form's step-in still moves it). */
  windup: {
    slot: number;
    aim: Vec | null;
    /** Where the press aimed (the fallback if auto-aim finds nothing at landing). */
    at: Vec;
```
with:
```ts
  /**
   * An ability winding up (every ability conjures; cast payment channels too):
   * the hero can't attack meanwhile, and walks slowed, facing it (see the
   * weapon flow spec).
   */
  windup: {
    slot: number;
    aim: Vec | null;
    /** Where the press aimed (the fallback if auto-aim finds nothing at landing). */
    at: Vec;
    /** Where the hero stood when the wind-up began. */
    from: Vec;
```

Replace:
```ts
  /** A basic attack in its startup: the blow lands at `strikeAt`. */
  swing: {
```
with:
```ts
  /** A basic attack in its startup: the blow lands at `strikeAt`; the hero walks slowed meanwhile, facing `dir`. */
  swing: {
```

Replace:
```ts
    /** Committed swings root the hero, lunge and leave a recovery (automatic swings on the move don't). */
    committed: boolean;
    /** A manual hold blow held at its strike point: since when (else null). */
    held: number | null;
  } | null;
  /** Each running push (a lunge, a step-in, a step or a recoil), in the order they began. */
  pushes: Push[];
  /** Movement is slowed until this time (after a strike or a landed ability). */
```
with:
```ts
    /** A committed swing leaves a recovery (moving during an automatic swing's startup clears it). */
    committed: boolean;
    /** A manual hold blow held at its strike point: since when (else null). */
    held: number | null;
  } | null;
  /** Each running push (a lunge, a step-in, a step or a recoil), in the order they began. */
  pushes: Push[];
  /** Movement is slowed until this time (after a committed strike or a landed ability). */
```

- [ ] **Step 4: A wind-up's `from` and the way it faces**

In `packages/engine/src/arpg/abilities/cast.ts` (both wind-ups record `from`; `holdTick`'s comment; `windupDir` before `castTick`):

Before:
```ts
    start: t,
    until: t + ab.castTime,
```
add:
```ts
    from: { x: h.x, y: h.y },
```

Before:
```ts
    start: t,
    until: t + left,
```
add:
```ts
    from: { x: h.x, y: h.y },
```

Replace:
```ts
 * fires it at its stage. Meanwhile the hero stays rooted and each new stage
 * says so. A held button, charging or aiming, pauses its slot's restart window.
 */
```
with:
```ts
 * fires it at its stage. Meanwhile the hero walks slowed, facing its aim, and
 * each new stage says so. A held button, charging or aiming, pauses its
 * slot's restart window.
 */
```

Before:
```ts
/**
 * Land a finished wind-up: its press-time move (a released hold's stage).
```
add:
```ts
type Windup = NonNullable<HeroEntity['windup']>;

/**
 * The way a wind-up faces: toward its `at`; null for one aimed where it began
 * (a self-centred form) or with the hero standing on its `at`, which keeps
 * the hero's facing.
 */
export function windupDir(h: HeroEntity, w: Windup): Vec | null {
  if (w.from.x === w.at.x && w.from.y === w.at.y) return null;
  const d = dirTo(h.x, h.y, w.at.x, w.at.y);
  return d.x === 0 && d.y === 0 ? null : d;
}

```

- [ ] **Step 5: A swing faces its action**

In `packages/engine/src/arpg/basic.ts` (`startSwing`):

Replace:
```ts
 * reach, else straight ahead. A committed swing roots the hero, lunges and
 * ends any recovery; a manual hold blow starts as a medium one (it holds at
```
with:
```ts
 * reach, else straight ahead. The hero faces it; a committed swing lunges and
 * ends any recovery; a manual hold blow starts as a medium one (it holds at
```

Replace:
```ts
  if (committed || !h.moving) h.facing = dir;
  h.swing = {
```
with:
```ts
  h.facing = dir;
  h.swing = {
```

- [ ] **Step 6: One movement a tick**

In `packages/engine/src/arpg/step.ts` (the imports; the automatic swing moved off keeps its lunge; the movement block, whose unit steering is `heading`, as `steer` is the module's Volley homing; `actionFacing` before `pressDue`):

Before:
```ts
  MonsterEntity,
```
add:
```ts
  HeroEntity,
```

Replace:
```ts
} from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
import { chargeCap } from './abilities/resolve.js';
import { nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { createMonsterEntity } from './world.js';
import { basicHoldTick, burstShot, startSwing, strike } from './basic.js';
import { cancelSwing, dropHold, endPushes, pushesTick, swingStrikes } from './action.js';
```
with:
```ts
  windupDir,
} from './abilities/cast.js';
import { defendTick, gainCharge, surging } from './abilities/defend.js';
import { impact } from './abilities/impact.js';
import { chargeCap } from './abilities/resolve.js';
import { nearestMonster, spawnProjectile } from './abilities/targeting.js';
import { createMonsterEntity } from './world.js';
import { basicHoldTick, burstShot, startSwing, strike } from './basic.js';
import { cancelSwing, dropHold, pushesTick, swingStrikes } from './action.js';
```

Replace:
```ts
  // Automatic swings commit only while the hero stands still: moving releases one (the blow
  // still lands at its strike, from wherever the hero is), and one whose foe is gone is dropped.
  if (input.attack === undefined && h.swing) {
    const target = h.swing.targetId;
    if (target !== null && !world.monsters.some((m) => m.id === target && !m.dead))
      cancelSwing(ctx);
    else if (h.swing.committed && speed > 0.05) {
      h.swing.committed = false;
      endPushes(h, 'lunge');
    }
  }

  // Movement: a push carries the hero; a wind-up, a hold or a committed swing roots it; a
  // recovery slows it.
  const surge = surging(ctx);
  const pushed = !dashing && h.pushes.length > 0;
  if (pushed) pushesTick(ctx, null);
  const rooted = !!h.windup || !!h.hold || !!h.swing?.committed;
  h.moving = speed > 0.05 && !dashing && !pushed && !rooted;
  if (h.moving) {
    const slow = t < h.recoverUntil ? bal.feel.recoveryMove : 1;
    // Lightning Rod quickens the step, on top of Surge and any recovery.
    const quick = t < h.quickUntil ? 1 + bal.reactions.lightningRodMove : 1;
    const pace =
      h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * quick * slow;
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
    h.facing = { x: v.x / speed, y: v.y / speed };
  }
```
with:
```ts
  // Automatic swings commit only while the hero stands still: moving during the startup clears
  // that, so the blow leaves no recovery (it still lunges and lands). One whose foe is gone is
  // dropped.
  if (input.attack === undefined && h.swing) {
    const target = h.swing.targetId;
    if (target !== null && !world.monsters.some((m) => m.id === target && !m.dead))
      cancelSwing(ctx);
    else if (speed > 0.05) h.swing.committed = false;
  }

  // Movement, once a tick (see the weapon flow spec): the steering at the hero's pace, slowed
  // while it acts or recovers (the slower wins); then each push's slice, less any part against
  // the steering. Acting, the hero faces its action (steering strafes); else its steering.
  const surge = surging(ctx);
  h.moving = speed > 0.05 && !dashing;
  const heading = h.moving ? { x: v.x / speed, y: v.y / speed } : null;
  const acting = !!h.swing || !!h.windup || !!h.hold;
  if (heading) {
    const slow = Math.min(
      acting ? bal.feel.actionMove : 1,
      t < h.recoverUntil ? bal.feel.recoveryMove : 1,
    );
    // Lightning Rod quickens the step, on top of Surge and any slowing.
    const quick = t < h.quickUntil ? 1 + bal.reactions.lightningRodMove : 1;
    const pace =
      h.stats.moveSpeed * (surge ? 1 + bal.abilities.defend.surgeMove : 1) * quick * slow;
    h.x = clamp(h.x + v.x * pace * dt, h.radius, world.width - h.radius);
    h.y = clamp(h.y + v.y * pace * dt, h.radius, world.height - h.radius);
  }
  if (!dashing) pushesTick(ctx, heading);
  if (acting) h.facing = actionFacing(h) ?? h.facing;
  else if (heading) h.facing = heading;
```

Before:
```ts
/**
 * When the first press waiting now will fire: the later of its slot's beat end
```
add:
```ts
/**
 * The way the hero faces while it acts: its swing's, its wind-up's
 * (`windupDir`), or toward its hold's aim; null for an action with no way (a
 * self-centred wind-up, a hold with nothing to aim at), which keeps the facing.
 */
function actionFacing(h: HeroEntity): Vec | null {
  if (h.swing) return h.swing.dir;
  if (h.windup) return windupDir(h, h.windup);
  if (!h.hold?.aim) return null;
  const d = dirTo(h.x, h.y, h.hold.aim.x, h.hold.aim.y);
  return d.x === 0 && d.y === 0 ? null : d;
}

```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/ability-cast.test.ts tests/delve-chains.test.ts tests/delve-combat-weight.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 132 passed.

- [ ] **Step 8: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1323 tests pass in 76 files (the pacing rails hold: the bot now walks while it casts).

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/ability-cast.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts
git commit -m "feat(engine): no rooting: the steering blends with every push, and acting slows the hero and faces the action" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Past the aim point, a directional form fires along the press's way

A directional form (Bolt, Volley, Lance, Strike) that fires at its `at` (a manual aim, or the fallback when auto-aim finds nothing at the landing) once the hero has walked past it fires along the way from where the wind-up began, at `h + (at − from)`, instead of turning round, and its wind-up faces that way meanwhile (`passedAim`, in `windupDir` too). Placed forms still face and land at `at`, and a successful auto-aim at the landing still turns toward the nearest foe.

**Files:**
- Modify: `packages/engine/tests/delve-weapon-flow.test.ts:7,227`
- Modify: `packages/engine/src/arpg/abilities/targeting.ts:59` (CRLF: hand-edit, never format)
- Modify: `packages/engine/src/arpg/abilities/cast.ts:9,313`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-weapon-flow.test.ts` (the imports, and a `describe` at the end):

Replace:
```ts
import { MOVE_KINDS } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import {
  arena,
  bal,
```
with:
```ts
import { MOVE_KINDS, type FormId } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import {
  arena,
  bal,
  damaged,
```

After:
```ts
    expect(h.hero.facing).toEqual({ x: 0, y: -1 });
  });
});
```
add:
```ts

describe('past the aim point', () => {
  /** A `form` Primary aimed 0.2 ahead, the hero steering on up through its wind-up. */
  const walkPast = (form: FormId) => {
    const w = arena([dummy(13, 20)], { noBasic: true, primary: { form } });
    pressOnly(w, 0, { x: 13, y: 35.8 });
    for (let i = 0; i < 60 && w.hero.windup; i++)
      stepWorld(registry, w, { move: { x: 0, y: -1 } }, STEP);
    expect(w.hero.y).toBeLessThan(35.8);
    return w;
  };

  it("a directional form fires along the press's way once the hero has walked past its aim", () => {
    const [bolt] = walkPast('bolt').projectiles;
    expect(bolt.vy).toBeLessThan(0);
    expect(bolt.vx).toBeCloseTo(0, 9);
  });

  it("so does one fired at the press's aim when auto-aim finds nothing at the landing", () => {
    // The foe it aimed at is gone by the landing (another, far off, keeps the floor going).
    const w = arena([dummy(13, 30), dummy(1, 1)], { noBasic: true });
    pressOnly(w, 0);
    w.monsters[0].dead = true;
    w.hero.y = 28;
    run(w, 0.3);
    expect(w.projectiles[0].vy).toBeLessThan(0);
  });

  it("past it, a directional wind-up faces along the press's way; a placed one turns to its aim", () => {
    const facing = (form: FormId) => {
      const w = arena([dummy(13, 20)], { noBasic: true, primary: { form } });
      pressOnly(w, 0, { x: 13, y: 35.8 });
      for (let i = 0; i < 60 && w.hero.windup && w.hero.y >= 35.8; i++)
        stepWorld(registry, w, { move: { x: 0, y: -1 } }, STEP);
      expect(w.hero.windup).not.toBeNull();
      return w.hero.facing;
    };
    expect(facing('bolt')).toEqual({ x: 0, y: -1 });
    expect(facing('burst')).toEqual({ x: 0, y: 1 });
  });

  it('a placed form still lands at its aim point', () => {
    const z = walkPast('burst').zones.find((q) => q.source === 'burst')!;
    expect(z.x).toBeCloseTo(13, 9);
    expect(z.y).toBeCloseTo(35.8, 9);
  });

  it('a successful auto-aim at the landing still turns toward the nearest foe', () => {
    const w = arena([dummy(13, 30)], { noBasic: true });
    pressOnly(w, 0);
    // Past the foe it aimed at: the Bolt turns round and hits it.
    w.hero.y = 28;
    run(w, 0.3);
    expect(damaged(w.monsters[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-weapon-flow.test.ts)`
Expected: 3 failed, 13 passed (16): "a directional form fires along the press's way once the hero has walked past its aim" and "so does one fired at the press's aim when auto-aim finds nothing at the landing" (each `expected 13 to be less than 0`: the Bolt turns round), and "past it, a directional wind-up faces along the press's way…". The placed form and the auto-aim already behave; they guard the rule's edges.

- [ ] **Step 3: Export `DIRECTIONAL`**

In `packages/engine/src/arpg/abilities/targeting.ts` (CRLF: hand-edit):

Replace:
```ts
const DIRECTIONAL = new Set(['bolt', 'volley', 'lance', 'strike']);
const PLACED = new Set(['burst', 'barrage', 'maelstrom']);
```
with:
```ts
/** Forms fired along a way from the hero (the rest are placed, self-centred or Blink). */
export const DIRECTIONAL = new Set(['bolt', 'volley', 'lance', 'strike']);
const PLACED = new Set(['burst', 'barrage', 'maelstrom']);
```

- [ ] **Step 4: The landing**

In `packages/engine/src/arpg/abilities/cast.ts` (the import; `passedAim`, and `windupDir` turning a directional wind-up along the press's way; `castTick`):

Replace:
```ts
import { aimPoint, nearestMonster } from './targeting.js';

```
with:
```ts
import { aimPoint, DIRECTIONAL, nearestMonster } from './targeting.js';

```

Replace:
```ts
 * The way a wind-up faces: toward its `at`; null for one aimed where it began
 * (a self-centred form) or with the hero standing on its `at`, which keeps
 * the hero's facing.
 */
export function windupDir(h: HeroEntity, w: Windup): Vec | null {
  if (w.from.x === w.at.x && w.from.y === w.at.y) return null;
  const d = dirTo(h.x, h.y, w.at.x, w.at.y);
  return d.x === 0 && d.y === 0 ? null : d;
}

/**
 * Land a finished wind-up: its press-time move (a released hold's stage).
 * Auto-aim is chosen again now; if nothing is left to aim at, it lands where
 * the press aimed.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  if (!h.windup || ctx.world.t < h.windup.until - 1e-9) return;
  const { slot, aim, at, step, stage } = h.windup;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  finishPushes(ctx, 'stepIn');
  if (!fire(ctx, slot, aim, step, stage)) fire(ctx, slot, at, step, stage);
```
with:
```ts
 * Whether the hero has walked past a directional wind-up's `at`: the way to
 * `at` has turned 90° or more from the way from where the wind-up began (or
 * the hero stands on it). Never for a placed or self-centred form.
 */
function passedAim(h: HeroEntity, w: Windup): boolean {
  if (!DIRECTIONAL.has(chainMove(h.chains[w.slot], w.step, w.stage).form.id)) return false;
  const first = dirTo(w.from.x, w.from.y, w.at.x, w.at.y);
  const now = dirTo(h.x, h.y, w.at.x, w.at.y);
  return (first.x !== 0 || first.y !== 0) && now.x * first.x + now.y * first.y <= 0;
}

/**
 * The way a wind-up faces: toward its `at`, or, a directional form's once the
 * hero has walked past it, along the way from where it began; null for one
 * aimed where it began (a self-centred form) or with the hero standing on a
 * placed form's `at`, which keeps the hero's facing.
 */
export function windupDir(h: HeroEntity, w: Windup): Vec | null {
  if (w.from.x === w.at.x && w.from.y === w.at.y) return null;
  if (passedAim(h, w)) return dirTo(w.from.x, w.from.y, w.at.x, w.at.y);
  const d = dirTo(h.x, h.y, w.at.x, w.at.y);
  return d.x === 0 && d.y === 0 ? null : d;
}

/**
 * Land a finished wind-up: its press-time move (a released hold's stage).
 * Auto-aim is chosen again now; if nothing is left to aim at, it lands where
 * the press aimed. A directional form fired at that aim (a manual one, or
 * that fallback) once the hero has walked past it goes along the press's way
 * instead of turning round (see the weapon flow spec); placed forms land at
 * `at` wherever the hero stands.
 */
export function castTick(ctx: SimCtx): void {
  const h = ctx.world.hero;
  const w = h.windup;
  if (!w || ctx.world.t < w.until - 1e-9) return;
  const { slot, aim, at, step, stage } = w;
  h.windup = null;
  // A step-in finishes before the blow lands, so it hits from where the step took the hero.
  finishPushes(ctx, 'stepIn');
  const along = passedAim(h, w) ? { x: h.x + at.x - w.from.x, y: h.y + at.y - w.from.y } : null;
  if (!fire(ctx, slot, aim && (along ?? aim), step, stage))
    fire(ctx, slot, along ?? at, step, stage);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-weapon-flow.test.ts)`
Expected: 16 passed.

- [ ] **Step 6: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1328 tests pass in 76 files.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/src/arpg/abilities/cast.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/src/arpg/abilities/targeting.ts packages/engine/src/arpg/abilities/cast.ts
git commit -m "feat(engine): a directional form walked past its aim point fires along the press's way" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 4: Engine: weapon styles

### Task 5: Every swing lunges; a blow's step back, side step and hop

The spec's weapon table goes in (the `move` column: bigger heavy and hold lunges, the staff and the wand no longer recoil, the bow steps back 0.4 to 1.2). Every swing lunges its row's forward `move` (planted for `lungeHold`, then in, stopping at its foe), committed or not, and looks for a foe within its reach plus its lunge (plus 1 for a manual swing). At the strike, a blow's step back (a negative `move`), its hop and its side step make one `step` push over `stepSeconds`, with no stop: the side is the steering's when its part square to the blow is at least `sideSteer`, else the weapon's sway (`alternate` flips from the last side taken, `orbit` keeps it), and `HeroEntity.swaySide` records it (1 at first, and again after a respawn). `strike` and `basicHoldTick` take the stick for it.

**Files:**
- Modify: `packages/engine/tests/delve-weapon-flow.test.ts:7,40,284` (the `move` column; the weapon styles)
- Modify: `packages/engine/tests/delve-chains.test.ts:176,208,242` (the data tests leave out the motion columns)
- Modify: `packages/engine/tests/delve-combat-weight.test.ts:340,350,490` (a swing on the move lunges; a shot's recoil is the bow's step back now)
- Modify: `packages/engine/tests/delve-training.test.ts:615,632` (a respawn resets `swaySide`)
- Modify: `packages/engine/src/data/delve.json:27,59,85,115,143,176,209` (the `move` column; hand-edit, never format)
- Modify: `packages/engine/src/types/arpg.ts:438`
- Modify: `packages/engine/src/arpg/world.ts:233`, `packages/engine/src/arpg/sandbox.ts:283`
- Modify: `packages/engine/src/arpg/basic.ts:14,40,66,91,126,139,257,286`
- Modify: `packages/engine/src/arpg/step.ts:228`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-weapon-flow.test.ts` (the imports; the data test pins the `move` column too; a `describe` at the end):

Replace:
```ts
import { MOVE_KINDS, type FormId } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
```
with:
```ts
import { MOVE_KINDS, type FormId, type MoveKind } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
```

Replace:
```ts
  it("each weapon's side steps, hops and sway", () => {
    expect(byKind('side')).toEqual({
```
with:
```ts
  it("each weapon's moves, side steps, hops and sway", () => {
    expect(byKind('move')).toEqual({
      dagger: [0.25, 0.3, 0.7, 0.9],
      sword: [0.4, 0.8, 1.2, 1.6],
      axe: [0.3, 0.4, 0.9, 1.2],
      maul: [0.15, 0.3, 1.6, 2.0],
      staff: NONE,
      wand: NONE,
      bow: [-0.4, -0.6, -0.9, -1.2],
    });
    expect(byKind('side')).toEqual({
```

After:
```ts
    expect(damaged(w.monsters[0])).toBe(true);
  });
});
```
add:
```ts

describe('weapon styles', () => {
  /** A `baseId` hero whose basic chain is `kinds`, one sturdy foe `gap` from its edge straight up. */
  const fighter = (baseId: string, kinds: MoveKind[], gap: number) => {
    const w = strikeWorld(
      { weapon: gear('fire', 'weapon', baseId) },
      { basic: kinds.map((kind) => ({ kind, element: 'fire' as const })) },
      false,
      dummy(13, 0),
    );
    place(w, gap);
    return w;
  };
  /** Step until the next blow lands and its step (if any) has run out. */
  const blowAndStep = (w: ArpgWorld, move: Vec = still) => {
    let struck = false;
    for (let i = 0; i < 300 && !struck; i++)
      struck = stepWorld(registry, w, { move }, STEP).some((e) => e.kind === 'basic');
    run(w, bal.feel.stepSeconds + STEP, move);
  };

  it("a melee blow lunges its kind's move, stopping at contact", () => {
    for (const baseId of ['dagger', 'sword', 'axe', 'maul'])
      for (const kind of ['light', 'medium', 'heavy'] as const) {
        const { move, hop = 0 } = registry.getGearBase(baseId).feel![kind];
        // In reach once the lunge is done, but short of contact (a dagger's heavy then hops back).
        const w = fighter(baseId, [kind], move + 0.3);
        const y0 = w.hero.y;
        blowAndStep(w);
        expect(y0 - w.hero.y, `${baseId} ${kind}`).toBeCloseTo(move - hop, 5);
      }
    // A maul's slam leaps 1.6, but only to its foe's contact gap.
    const w = fighter('maul', ['heavy'], 1);
    const y0 = w.hero.y;
    blowAndStep(w);
    expect(y0 - w.hero.y).toBeCloseTo(1 - bal.feel.contactGap, 5);
  });

  it("a bow steps back its kind's move after the release", () => {
    for (const kind of ['light', 'medium', 'heavy'] as const) {
      const w = fighter('bow', [kind], 5);
      const y0 = w.hero.y;
      blowAndStep(w);
      expect(w.hero.y - y0, kind).toBeCloseTo(-w.hero.stats.weapon.feel[kind].move, 5);
    }
  });

  it("a blow's step survives the chain's next cast", () => {
    const w = fighter('bow', ['light'], 5);
    for (let i = 0; i < 60 && w.hero.pushes.length === 0; i++)
      stepWorld(registry, w, { move: still }, STEP);
    const [step] = w.hero.pushes;
    expect(step.kind).toBe('step');
    pressOnly(w, 0);
    expect(w.hero.windup).not.toBeNull();
    expect(w.hero.pushes).toContain(step);
    run(w, bal.feel.stepSeconds + STEP);
    expect(step.movedY).toBeCloseTo(-w.hero.stats.weapon.feel.light.move, 5);
  });

  it('a dagger hops back after its heavy blow; steering at the foe drops the hop', () => {
    const hop = (move: Vec) => {
      const w = fighter('dagger', ['heavy'], 1);
      for (let i = 0; i < 60 && !w.hero.pushes.some((p) => p.kind === 'step'); i++)
        stepWorld(registry, w, { move }, STEP);
      const step = w.hero.pushes.find((p) => p.kind === 'step')!;
      run(w, bal.feel.stepSeconds + STEP, move);
      return step.movedY;
    };
    expect(hop(still)).toBeCloseTo(registry.getGearBase('dagger').feel!.heavy.hop!, 5);
    expect(hop({ x: 0, y: -1 })).toBeCloseTo(0, 9);
  });

  it('a staff alternates its side step; a wand keeps its side, circling', () => {
    const sides = (baseId: string) => {
      const w = fighter(baseId, ['light'], 4);
      const out: number[] = [];
      for (let i = 0; i < 3; i++) {
        const x = w.hero.x;
        blowAndStep(w);
        out.push(Math.sign(w.hero.x - x));
        expect(w.hero.swaySide).toBe(out[i]);
      }
      return out;
    };
    // Facing up, side 1 is to the right (+x).
    expect(sides('staff')).toEqual([-1, 1, -1]);
    expect(sides('wand')).toEqual([1, 1, 1]);
  });

  it("the steering's part square to the blow picks the side from sideSteer up, and is recorded", () => {
    /** A first light blow's side step, aimed straight up, the hero then steering at the foe, part sideways. */
    const side = (baseId: string, lateral: number) => {
      const w = fighter(baseId, ['light'], 4);
      stepWorld(registry, w, { move: still }, STEP);
      const move = { x: lateral, y: -Math.sqrt(1 - lateral * lateral) };
      for (let i = 0; i < 60 && !w.hero.pushes.some((p) => p.kind === 'step'); i++)
        stepWorld(registry, w, { move }, STEP);
      const step = w.hero.pushes.find((p) => p.kind === 'step')!;
      run(w, bal.feel.stepSeconds + STEP, move);
      return { swaySide: w.hero.swaySide, moved: step.movedX };
    };
    // Facing up, side 1 is to the right. By its sway a staff's first step goes left, a wand's right.
    expect(side('staff', 0.25).swaySide).toBe(-1);
    expect(side('staff', bal.feel.sideSteer)).toMatchObject({ swaySide: 1 });
    expect(side('staff', 0.5).moved).toBeCloseTo(
      registry.getGearBase('staff').feel!.light.side!,
      5,
    );
    expect(side('wand', -0.25).swaySide).toBe(1);
    expect(side('wand', -0.5)).toMatchObject({ swaySide: -1 });
  });

  it('an automatic swing started on the move lunges and acquires at reach plus its lunge', () => {
    const w = fighter('sword', ['light'], 0);
    const { range } = w.hero.stats.weapon;
    const { move } = w.hero.stats.weapon.feel.light;
    // Its edge past the weapon's range from the hero's centre, inside range plus the lunge.
    place(w, range + move / 2 - w.hero.radius);
    stepWorld(registry, w, { move: { x: 1, y: 0 } }, STEP);
    expect(w.hero.swing).toMatchObject({ committed: false, targetId: w.monsters[0].id });
    expect(kinds(w)).toEqual(['lunge']);
  });
});
```

In `packages/engine/tests/delve-chains.test.ts` (`stepless` becomes `motionless`, which also drops `move`, on both sides of the strings' comparison; `numbers` leaves `move` out; the maul's light keeps every other rule):

Replace:
```ts
/** A row without its step (`side`, `hop`: the weapon flow spec's, pinned in delve-weapon-flow.test.ts). */
function stepless({ side: _side, hop: _hop, ...row }: ComboStepDef): ComboStepDef {
  return row;
}

/** Every number of a row, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
function numbers(row: ComboStepDef, arc: number) {
  const r = (x: number) => +x.toFixed(6);
  return {
    time: r(row.time),
    startup: r(row.startup),
    move: r(row.move),
```
with:
```ts
/**
 * A row without its motion (`move`, `side`, `hop`: the weapon flow spec's
 * table, pinned in delve-weapon-flow.test.ts).
 */
function motionless({ move: _move, side: _side, hop: _hop, ...row }: ComboStepDef) {
  return row;
}

/** Every number of a row but its motion, with its defaults filled in and rounded (so 0.35 × 1.5 is 0.525). */
function numbers(row: ComboStepDef, arc: number) {
  const r = (x: number) => +x.toFixed(6);
  return {
    time: r(row.time),
    startup: r(row.startup),
```

Replace:
```ts
        chain.map((k) => stepless(feel[k])),
        id,
      ).toEqual(string);
    }
    expect(weapon('dagger').chain).toEqual(['light', 'light', 'medium', 'heavy']);
    expect(weapon('maul').chain).toEqual(['medium', 'heavy']);
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed'])
      expect(weapon(id).chain, id).toEqual(['light', 'light', 'heavy']);
  });

  it('a medium row the string lacks is halfway between light and heavy in every number', () => {
```
with:
```ts
        chain.map((k) => motionless(feel[k])),
        id,
      ).toEqual(string.map(motionless));
    }
    expect(weapon('dagger').chain).toEqual(['light', 'light', 'medium', 'heavy']);
    expect(weapon('maul').chain).toEqual(['medium', 'heavy']);
    for (const id of ['sword', 'axe', 'staff', 'wand', 'bow', 'unarmed'])
      expect(weapon(id).chain, id).toEqual(['light', 'light', 'heavy']);
  });

  it('a medium row the string lacks is halfway between light and heavy in every number but its motion', () => {
```

Replace:
```ts
          move: medium.move * 0.8,
        },
```
with:
```ts
        },
```

In `packages/engine/tests/delve-combat-weight.test.ts`:

Replace:
```ts
  it('automatic swings on the move walk slowed and leave no recovery', () => {
    const w = arena([dummy(13, 0)]);
```
with:
```ts
  it('automatic swings on the move walk slowed, lunge and leave no recovery', () => {
    const w = arena([dummy(13, 0)]);
```

Replace:
```ts
    expect(w.hero.pushes).toEqual([]);
    // Past the strike: no recovery slow.
```
with:
```ts
    expect(w.hero.pushes.map((p) => p.kind)).toEqual(['lunge']);
    // Past the strike: no recovery slow.
```

Replace:
```ts
  it('a committed shot recoils after the release; one on the move does not', () => {
    const wand = { weapon: gear('fire', 'weapon', 'wand') };
    const w = arena([dummy(13, 30)], { equipped: wand });
    const y0 = w.hero.y;
    until(w, () => w.hero.attackCount >= 1);
    run(w, bal.feel.recoilSeconds + STEP);
    expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.blows[0].move, 2);

    const m = arena([dummy(13, 30)], { equipped: wand });
    const my0 = m.hero.y;
    until(m, () => m.hero.attackCount >= 1, { move: { x: 1, y: 0 } });
    run(m, bal.feel.recoilSeconds + STEP, { x: 1, y: 0 });
    expect(m.hero.y).toBeCloseTo(my0, 6);
  });
```
with:
```ts
  it('a shot steps back after its release, standing or on the move', () => {
    const bow = { weapon: gear('fire', 'weapon', 'bow') };
    for (const move of [still, { x: 1, y: 0 }]) {
      const w = arena([dummy(13, 30)], { equipped: bow });
      const y0 = w.hero.y;
      until(w, () => w.hero.attackCount >= 1, { move });
      run(w, bal.feel.stepSeconds + STEP, move);
      // Straight back from the foe above: square to the steering, so all of it applies.
      expect(w.hero.y - y0).toBeCloseTo(-w.hero.stats.weapon.blows[0].move, 2);
    }
  });
```

In `packages/engine/tests/delve-training.test.ts` (the respawn test):

Before:
```ts
    h.recoverUntil = w.t + 5;
```
add:
```ts
    h.swaySide = -1;
```

Before:
```ts
      dodge: null,
```
add:
```ts
      swaySide: 1,
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-combat-weight.test.ts tests/delve-training.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 9 failed, 165 passed (174): "each weapon's moves, side steps, hops and sway"; in `weapon styles`, "a melee blow lunges its kind's move…", "a dagger hops back after its heavy blow; steering at the foe drops the hop", "a staff alternates its side step…", "the steering's part square to the blow picks the side…" and "an automatic swing started on the move lunges…"; "respawn restores the hero…"; "automatic swings on the move walk slowed, lunge and leave no recovery"; "a shot steps back after its release, standing or on the move". ("a bow steps back its kind's move after the release" and "a blow's step survives the chain's next cast" pass already: they read the bow's old, smaller `move`, which today's committed recoil covers, and Task 2 already keeps pushes through a cast.)

- [ ] **Step 3: The table's `move` column**

In `packages/engine/src/data/delve.json` (hand-edit; in order: the dagger's hold, the sword's hold, the axe's heavy and hold, the maul's rows, the staff's, the wand's, the bow's):

Replace:
```json
        "hold": { "time": 1.4, "startup": 0.525, "move": 0.7, "hop": 0.8, "power": 2.21, "heft": 0.8, "arc": 150, "knockback": 0.3 }
      },
```
with:
```json
        "hold": { "time": 1.4, "startup": 0.525, "move": 0.9, "hop": 0.8, "power": 2.21, "heft": 0.8, "arc": 150, "knockback": 0.3 }
      },
```

Replace:
```json
        "hold": { "time": 1.3, "startup": 0.6, "move": 1.2, "power": 2.21, "heft": 1.0, "arc": 50, "reach": 0.9, "knockback": 0.6 }
      },
```
with:
```json
        "hold": { "time": 1.3, "startup": 0.6, "move": 1.6, "power": 2.21, "heft": 1.0, "arc": 50, "reach": 0.9, "knockback": 0.6 }
      },
```

Replace:
```json
        "heavy": { "time": 1.3, "startup": 0.4, "move": 0.5, "power": 1.7, "heft": 0.8, "arc": 360, "knockback": 0.5 },
        "hold": { "time": 1.3, "startup": 0.6, "move": 0.5, "power": 2.21, "heft": 1.0, "arc": 360, "knockback": 0.5 }
      },
```
with:
```json
        "heavy": { "time": 1.3, "startup": 0.4, "move": 0.9, "power": 1.7, "heft": 0.8, "arc": 360, "knockback": 0.5 },
        "hold": { "time": 1.3, "startup": 0.6, "move": 1.2, "power": 2.21, "heft": 1.0, "arc": 360, "knockback": 0.5 }
      },
```

Replace:
```json
        "light": { "time": 0.85, "startup": 0.405, "move": 0.4, "power": 0.8, "heft": 0.45, "arc": 140 },
        "medium": { "time": 1.0, "startup": 0.45, "move": 0.5, "power": 1.0, "heft": 0.6, "arc": 140 },
        "heavy": { "time": 1.3, "startup": 0.5, "move": 0.7, "power": 1.8, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true },
        "hold": { "time": 1.3, "startup": 0.75, "move": 0.7, "power": 2.34, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true }
      },
```
with:
```json
        "light": { "time": 0.85, "startup": 0.405, "move": 0.15, "power": 0.8, "heft": 0.45, "arc": 140 },
        "medium": { "time": 1.0, "startup": 0.45, "move": 0.3, "power": 1.0, "heft": 0.6, "arc": 140 },
        "heavy": { "time": 1.3, "startup": 0.5, "move": 1.6, "power": 1.8, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true },
        "hold": { "time": 1.3, "startup": 0.75, "move": 2.0, "power": 2.34, "heft": 1.0, "arc": 360, "reach": 0.4, "knockback": 0.8, "stagger": true }
      },
```

Replace:
```json
        "light": { "time": 0.9, "startup": 0.3, "move": -0.1, "side": 0.5, "power": 0.9, "heft": 0.2 },
        "medium": { "time": 1.1, "startup": 0.375, "move": -0.2, "side": 0.7, "power": 1.15, "heft": 0.4, "size": 1.4, "explode": 0.5 },
        "heavy": { "time": 1.3, "startup": 0.45, "move": -0.3, "side": 1.0, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 },
        "hold": { "time": 1.3, "startup": 0.675, "move": -0.3, "side": 1.3, "power": 1.82, "heft": 0.8, "size": 1.8, "explode": 1.0 }
      },
```
with:
```json
        "light": { "time": 0.9, "startup": 0.3, "move": 0, "side": 0.5, "power": 0.9, "heft": 0.2 },
        "medium": { "time": 1.1, "startup": 0.375, "move": 0, "side": 0.7, "power": 1.15, "heft": 0.4, "size": 1.4, "explode": 0.5 },
        "heavy": { "time": 1.3, "startup": 0.45, "move": 0, "side": 1.0, "power": 1.4, "heft": 0.6, "size": 1.8, "explode": 1.0 },
        "hold": { "time": 1.3, "startup": 0.675, "move": 0, "side": 1.3, "power": 1.82, "heft": 0.8, "size": 1.8, "explode": 1.0 }
      },
```

Replace:
```json
        "light": { "time": 0.9, "startup": 0.2, "move": -0.05, "side": 0.35, "power": 0.9, "heft": 0.1 },
        "medium": { "time": 1.05, "startup": 0.225, "move": -0.075, "side": 0.45, "power": 1.1, "heft": 0.2, "size": 1.25 },
        "heavy": { "time": 1.2, "startup": 0.25, "move": -0.1, "side": 0.6, "power": 1.3, "heft": 0.3, "size": 1.5 },
        "hold": { "time": 1.2, "startup": 0.375, "move": -0.1, "side": 0.8, "power": 1.69, "heft": 0.5, "size": 1.5 }
      },
```
with:
```json
        "light": { "time": 0.9, "startup": 0.2, "move": 0, "side": 0.35, "power": 0.9, "heft": 0.1 },
        "medium": { "time": 1.05, "startup": 0.225, "move": 0, "side": 0.45, "power": 1.1, "heft": 0.2, "size": 1.25 },
        "heavy": { "time": 1.2, "startup": 0.25, "move": 0, "side": 0.6, "power": 1.3, "heft": 0.3, "size": 1.5 },
        "hold": { "time": 1.2, "startup": 0.375, "move": 0, "side": 0.8, "power": 1.69, "heft": 0.5, "size": 1.5 }
      },
```

Replace:
```json
        "light": { "time": 0.85, "startup": 0.35, "move": -0.05, "power": 0.85, "heft": 0.2 },
        "medium": { "time": 1.125, "startup": 0.475, "move": -0.125, "power": 1.225, "heft": 0.4, "speed": 1.2 },
        "heavy": { "time": 1.4, "startup": 0.6, "move": -0.2, "power": 1.6, "heft": 0.6, "speed": 1.4 },
        "hold": { "time": 1.4, "startup": 0.9, "move": -0.2, "power": 2.08, "heft": 0.8, "speed": 1.4 }
      },
```
with:
```json
        "light": { "time": 0.85, "startup": 0.35, "move": -0.4, "power": 0.85, "heft": 0.2 },
        "medium": { "time": 1.125, "startup": 0.475, "move": -0.6, "power": 1.225, "heft": 0.4, "speed": 1.2 },
        "heavy": { "time": 1.4, "startup": 0.6, "move": -0.9, "power": 1.6, "heft": 0.6, "speed": 1.4 },
        "hold": { "time": 1.4, "startup": 0.9, "move": -1.2, "power": 2.08, "heft": 0.8, "speed": 1.4 }
      },
```

- [ ] **Step 4: `swaySide`**

In `packages/engine/src/types/arpg.ts`:

Replace:
```ts
  moving: boolean;
```
with:
```ts
  /** Steering (above 0.05) and not dashing. */
  moving: boolean;
  /** The side (1 or −1) the last side step took (see the weapon flow spec). */
  swaySide: number;
```

In `packages/engine/src/arpg/world.ts` (`createHeroEntity`):

Before:
```ts
  };
}

/**
 * Swap in new gear stats and chains mid-floor: the chains re-resolve and the
```
add:
```ts
    swaySide: 1,
```

In `packages/engine/src/arpg/sandbox.ts` (`respawnHero`):

Before:
```ts
  h.recoverUntil = t;
```
add:
```ts
  h.swaySide = 1;
```

- [ ] **Step 5: The lunge on every swing, and the blow's step**

In `packages/engine/src/arpg/basic.ts` (the module comment; `swingReach` without `committed`; `startSwing`'s comment and call; `basicHoldTick` passes the stick on; `strike` takes it and ends with `blowStep`, which replaces the committed shot's recoil):

Replace:
```ts
 * its element) has a startup (a committed melee blow lunges in), a strike,
 * and a recovery that slows movement. See the combat weight and the moves and
 * chains specs.
 */
```
with:
```ts
 * its element) has a startup (a forward `move` lunges in), a strike, then its
 * step (a step back, a side step, a hop), and a recovery that slows movement
 * after a committed blow. See the combat weight, the moves and chains, and the
 * weapon flow specs.
 */
```

Replace:
```ts
/** A swing on row `s`: a committed melee blow's lunge, its reach, and how far it looks for a foe. */
function swingReach(w: HeroWeapon, s: ComboStepDef, committed: boolean, manual: boolean) {
  const melee = w.kind === 'melee';
  const lunge = melee && committed ? Math.max(0, s.move) : 0;
  const reach = w.range + (melee ? (s.reach ?? 0) : 0);
  return { lunge, reach, acquire: (committed ? reach + lunge : w.range) + (manual ? 1 : 0) };
}
```
with:
```ts
/**
 * A swing on row `s`: its lunge (a forward `move`), its reach, and how far it
 * looks for a foe: its reach plus its lunge, plus 1 for a manual swing.
 */
function swingReach(w: HeroWeapon, s: ComboStepDef, manual: boolean) {
  const lunge = Math.max(0, s.move);
  const reach = w.range + (w.kind === 'melee' ? (s.reach ?? 0) : 0);
  return { lunge, reach, acquire: reach + lunge + (manual ? 1 : 0) };
}
```

Replace:
```ts
 * reach, else straight ahead. The hero faces it; a committed swing lunges and
 * ends any recovery; a manual hold blow starts as a medium one (it holds at
 * its strike point: see `basicHoldTick`). With a press waiting (see the chain
```
with:
```ts
 * reach, else straight ahead. The hero faces it, and it lunges (planted for
 * `lungeHold` of its startup, then in, stopping at its foe); a committed swing
 * ends any recovery. A manual hold blow starts as a medium one (it holds at
 * its strike point: see `basicHoldTick`). With a press waiting (see the chain
```

Replace:
```ts
  const { lunge, reach, acquire } = swingReach(w, s, committed, manual);
  const { target, dir } = aimAt(ctx, aim, acquire, { ...h.facing });
```
with:
```ts
  const { lunge, reach, acquire } = swingReach(w, s, manual);
  const { target, dir } = aimAt(ctx, aim, acquire, { ...h.facing });
```

Replace:
```ts
export function basicHoldTick(ctx: SimCtx, held: boolean, dt: number, aim: Vec | null): void {
  const { world, bal } = ctx;
```
with:
```ts
export function basicHoldTick(
  ctx: SimCtx,
  held: boolean,
  dt: number,
  aim: Vec | null,
  steer: Vec,
): void {
  const { world, bal } = ctx;
```

Replace:
```ts
      const { acquire } = swingReach(w, w.feel.medium, true, true);
      const { target, dir } = aimAt(ctx, aim, acquire, sw.dir);
      sw.dir = dir;
      sw.targetId = target?.id ?? null;
      h.facing = dir;
    }
    return strike(ctx, full ? 2 : stage);
  }
  if (stage > holdCharge(bal, sw.held, t - dt, fullTime).stage)
    ctx.events.push({ kind: 'holdStage', slot: null, stage });
}

/**
 * Land the swing's blow from where the hero stands now: in its element, with
 * its power and its kind's stacks. A held blow (`stage`) strikes with that
 * stage's row (medium, heavy, hold) and takes its time from it.
 */
export function strike(ctx: SimCtx, stage: number | null = null): void {
```
with:
```ts
      const { acquire } = swingReach(w, w.feel.medium, true);
      const { target, dir } = aimAt(ctx, aim, acquire, sw.dir);
      sw.dir = dir;
      sw.targetId = target?.id ?? null;
      h.facing = dir;
    }
    return strike(ctx, steer, full ? 2 : stage);
  }
  if (stage > holdCharge(bal, sw.held, t - dt, fullTime).stage)
    ctx.events.push({ kind: 'holdStage', slot: null, stage });
}

/**
 * Land the swing's blow from where the hero stands now: in its element, with
 * its power and its kind's stacks, then start its step. A held blow (`stage`)
 * strikes with that stage's row (medium, heavy, hold) and takes its time from
 * it. `steer` is the stick (length up to 1): its part square to the blow picks
 * the side step's side.
 */
export function strike(ctx: SimCtx, steer: Vec, stage: number | null = null): void {
```

Replace:
```ts
    if (sw.committed && s.move < 0)
      startPush(ctx, 'step', { x: -dir.x, y: -dir.y }, -s.move, bal.feel.recoilSeconds);
  }
```
with:
```ts
  }
  blowStep(ctx, s, dir, steer);
```

Before:
```ts
/** A basic shot with an explosion bursts over the foe it struck and every foe around it (each once). */
```
add:
```ts
/**
 * A blow's step, from its strike over `stepSeconds`: its step back (a negative
 * `move`) and hop away from `dir`, and its side step square to it, as one push
 * with no stop. The side is the steering's when its part square to `dir` is at
 * least `sideSteer`, else the weapon's `sway`: `alternate` flips from the
 * last side taken, `orbit` keeps it. See the weapon flow spec.
 */
function blowStep(ctx: SimCtx, s: ComboStepDef, dir: Vec, steer: Vec): void {
  const { world, bal } = ctx;
  const h = world.hero;
  const back = Math.max(0, -s.move) + (s.hop ?? 0);
  let side = 0;
  if (s.side) {
    // Square to the blow: (−dir.y, dir.x) is side 1.
    const lateral = -steer.x * dir.y + steer.y * dir.x;
    if (Math.abs(lateral) >= bal.feel.sideSteer - 1e-9) h.swaySide = Math.sign(lateral);
    else if (h.stats.weapon.sway === 'alternate') h.swaySide = -h.swaySide;
    side = s.side * h.swaySide;
  }
  const x = -dir.x * back - dir.y * side;
  const y = -dir.y * back + dir.x * side;
  const len = Math.hypot(x, y);
  if (len > 1e-9) startPush(ctx, 'step', { x: x / len, y: y / len }, len, bal.feel.stepSeconds);
}

```

In `packages/engine/src/arpg/step.ts` (the strike gets the stick):

Replace:
```ts
      basicHoldTick(ctx, input.attack, dt, input.attackAim ?? null);
    else strike(ctx);
  }
```
with:
```ts
      basicHoldTick(ctx, input.attack, dt, input.attackAim ?? null, v);
    else strike(ctx, v);
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chains.test.ts tests/delve-combat-weight.test.ts tests/delve-training.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 174 passed.

- [ ] **Step 7: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1335 tests pass in 76 files (the pacing rails hold).

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/delve-training.test.ts packages/engine/src/data/delve.json packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts
git commit -m "feat(engine): weapon styles: every swing lunges, and blows step back, side-step and hop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 5: Engine: the hold blow's leap

### Task 6: A charged hold blow leaps as it is let go, then strikes

A manual hold blow let go at stage 1 or 2, when its stage row lunges further than medium's, leaps the rest toward where it re-aimed over `stepSeconds` (a `lunge` push, stopping at the re-aimed target or else the first foe ahead), and strikes as it lands with its stage's row, straight from `step.ts` (`swing.released`), whatever the attack input does meanwhile. Its stage row's step follows the strike, and its timing counts from the strike. A leaping swing counts as striking (`swingStrikes`), so a waiting press, a repeat press and a held hold move wait until it lands. A dodge still cancels it, and a stop foe dying mid-leap ends the leap without moving the strike.

**Files:**
- Modify: `packages/engine/tests/delve-weapon-flow.test.ts:5,417` (the leap; determinism)
- Modify: `packages/engine/tests/delve-chains.test.ts:1060` (a charged sword blow now leaps, then strikes `stepSeconds` after its release)
- Modify: `packages/engine/tests/delve-chain-feel.test.ts:218` (a maul hold blow that fires by itself strikes `stepSeconds` after `holdMax × 1.3`)
- Modify: `packages/engine/src/types/arpg.ts:394`
- Modify: `packages/engine/src/arpg/basic.ts:108,128,147`
- Modify: `packages/engine/src/arpg/action.ts:131`
- Modify: `packages/engine/src/arpg/step.ts:194,226`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-weapon-flow.test.ts` (the imports, and two `describe`s at the end):

Replace:
```ts
import { dirTo } from '../src/arpg/geometry.js';
import { stepWorld } from '../src/arpg/step.js';
import { MOVE_KINDS, type FormId, type MoveKind } from '../src/types/ability.js';
import type { ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import {
  arena,
  bal,
  damaged,
```
with:
```ts
import { dirTo, dist } from '../src/arpg/geometry.js';
import { stepWorld } from '../src/arpg/step.js';
import { MOVE_KINDS, type FormId, type MoveKind } from '../src/types/ability.js';
import type { ArpgEvent, ArpgInput, ArpgWorld, Vec } from '../src/types/arpg.js';
import type { EquippedGear } from '../src/types/gear.js';
import {
  arena,
  bal,
  damaged,
  dodge,
```

After:
```ts
    expect(kinds(w)).toEqual(['lunge']);
  });
});
```
add:
```ts

describe("a hold blow's leap", () => {
  const MAUL = { weapon: gear('fire', 'weapon', 'maul') };
  const DAGGER = { weapon: gear('fire', 'weapon', 'dagger') };
  const letGo = { move: still, attack: false };
  const struck = (events: ArpgEvent[]) => events.find((e) => e.kind === 'basic');
  /**
   * A manual hold blow held to full charge at a sturdy foe `gap` from the hero's edge,
   * straight up (a second foe far off keeps the floor from clearing), then let go.
   */
  const released = (equipped: EquippedGear, gap: number) => {
    const w = strikeWorld(equipped, { basic: [{ kind: 'hold', element: 'fire' }] }, false);
    w.monsters.push({ ...arena([dummy(3, 5)]).monsters[0], id: 2000 });
    place(w, gap);
    const attack = { move: still, attack: true };
    for (let i = 0; i < 60 && w.hero.swing?.held == null; i++) stepWorld(registry, w, attack, STEP);
    const full = bal.chains.holdTime * w.hero.stats.tempo;
    for (let i = 0; i < Math.round(full / STEP); i++) stepWorld(registry, w, attack, STEP);
    const y0 = w.hero.y;
    expect(struck(stepWorld(registry, w, letGo, STEP))).toBeUndefined();
    expect(w.hero.swing).toMatchObject({ released: 2 });
    return { w, y0, t0: w.t };
  };
  /** Step with `input` until the blow lands; the tick it lands. */
  const land = (w: ArpgWorld, input: Partial<ArpgInput> = letGo, each = () => {}) => {
    for (let i = 0; i < 30; i++) {
      if (struck(stepWorld(registry, w, { move: still, ...input }, STEP))) return w.t;
      each();
    }
    return Infinity;
  };

  it('a charged maul leaps to its foe as it is let go, never shoving it, then strikes', () => {
    const { w, y0, t0 } = released(MAUL, 1.5);
    const m = w.monsters[0];
    const gap = dist(w.hero.x, y0, m.x, m.y) - m.radius - w.hero.radius;
    const my = m.y;
    const at = land(w, letGo, () => expect(m.y).toBe(my));
    expect(at - t0).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-9);
    expect(at - t0).toBeLessThan(bal.feel.stepSeconds + STEP);
    expect(y0 - w.hero.y).toBeCloseTo(gap - bal.feel.contactGap, 5);
  });

  it("a charged dagger leaps, strikes, then its hold row's hop follows", () => {
    const { w, y0 } = released(DAGGER, 1.8);
    const { medium, hold } = w.hero.stats.weapon.feel;
    land(w);
    const y1 = w.hero.y;
    expect(y0 - y1).toBeCloseTo(hold.move - medium.move, 5);
    // The attack stays let go (manual), so no new swing starts meanwhile.
    for (let i = 0; i < Math.round((bal.feel.stepSeconds + STEP) / STEP); i++)
      stepWorld(registry, w, letGo, STEP);
    expect(w.hero.y - y1).toBeCloseTo(hold.hop!, 5);
  });

  it('a press, a repeat press and a held hold move wait for it to land', () => {
    for (const input of [
      { cast: { slot: 0 } },
      { cast: { slot: 0, repeat: true } },
      { holding: 0 },
    ] as Partial<ArpgInput>[]) {
      const { w } = released(MAUL, 1.5);
      if (input.holding !== undefined)
        w.hero.chains = arena([], { primary: { kind: 'hold' } }).hero.chains;
      const order: string[] = [];
      for (let i = 0; i < 30 && !w.hero.windup && !w.hero.hold; i++)
        for (const e of stepWorld(
          registry,
          w,
          { ...letGo, ...(i === 0 ? input : { holding: input.holding }) },
          STEP,
        ))
          if (e.kind === 'basic' || e.kind === 'windup') order.push(e.kind);
      expect(order[0]).toBe('basic');
      expect(w.hero.windup ?? w.hero.hold).not.toBeNull();
    }
  });

  it('a foe that dies mid-leap ends the leap; the blow still lands on time', () => {
    const { w, t0 } = released(MAUL, 1.5);
    stepWorld(registry, w, letGo, STEP);
    w.monsters[0].dead = true;
    stepWorld(registry, w, letGo, STEP);
    expect(w.hero.pushes).toEqual([]);
    const y = w.hero.y;
    const at = land(w);
    expect(at - t0).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-9);
    expect(at - t0).toBeLessThan(bal.feel.stepSeconds + STEP);
    expect(w.hero.y).toBe(y);
  });

  it('pressing the attack again or turning automatic mid-leap changes nothing; a dodge cancels it', () => {
    const plain = released(MAUL, 1.5);
    const at = land(plain.w) - plain.t0;
    for (const input of [{ attack: true }, { attack: undefined }]) {
      const { w, t0 } = released(MAUL, 1.5);
      expect(land(w, input) - t0).toBeCloseTo(at, 9);
      expect(w.hero.y).toBeCloseTo(plain.w.hero.y, 9);
    }
    const { w } = released(MAUL, 1.5);
    dodge(w);
    expect(w.hero.swing).toBeNull();
    expect(land(w)).toBe(Infinity);
  });
});

describe('determinism', () => {
  it('steps, side steps, leaps and casts on the move are the same at 30, 60 and 120 frames a second', () => {
    const fight = (frames: number) => {
      const out: unknown[] = [];
      for (const baseId of ['staff', 'bow', 'maul']) {
        const w = strikeWorld(
          { weapon: gear('fire', 'weapon', baseId) },
          {
            basic: [
              { kind: 'light', element: 'fire' },
              { kind: 'hold', element: 'fire' },
            ],
          },
          false,
          dummy(13, 30),
        );
        w.monsters.push(
          ...arena([dummy(10, 28), dummy(16, 31)]).monsters.map((m, i) => ({ ...m, id: 2000 + i })),
        );
        for (let k = 0; k < Math.round(6 / STEP); k++) {
          const move = k % 60 < 30 ? { x: 1, y: 0 } : { x: -0.6, y: 0.6 };
          const attack = k % 50 < 40;
          const input = { move, attack, cast: k % 45 === 0 ? { slot: 0 } : null };
          // The presses go on a tick's first frame; movement and the attack on every frame.
          for (let f = 0; f < frames; f++)
            out.push(...stepWorld(registry, w, f === 0 ? input : { move, attack }, STEP / frames));
        }
        out.push([w.hero.x, w.hero.y, w.hero.swaySide]);
      }
      return out;
    };
    const at30 = fight(1);
    const count = (kind: string) => at30.filter((e) => (e as ArpgEvent).kind === kind).length;
    expect(count('basic')).toBeGreaterThan(5);
    expect(count('cast')).toBeGreaterThan(5);
    expect(fight(2)).toEqual(at30);
    expect(fight(4)).toEqual(at30);
  });
});
```

In `packages/engine/tests/delve-chains.test.ts` ("a manual hold blow holds at its strike point…"):

Replace:
```ts
    const release = stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(basics(release)[0]).toMatchObject({ moveKind: 'heavy', heft: f.heavy.heft });
    // Its startup was spent holding: the rest of the heavy row's cycle follows the release.
```
with:
```ts
    // A heavy lunges further than a medium: let go, it leaps the rest, then strikes as it
    // lands, `stepSeconds` later (see the weapon flow spec).
    const release = stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(basics(release)).toHaveLength(0);
    expect(w.hero.swing).toMatchObject({ released: 1 });
    const letGo = w.t;
    const landing: ArpgEvent[] = [];
    for (let i = 0; i < 30 && basics(landing).length === 0; i++)
      landing.push(...stepWorld(registry, w, { move: still, attack: false }, STEP));
    expect(basics(landing)[0]).toMatchObject({ moveKind: 'heavy', heft: f.heavy.heft });
    expect(w.t - letGo).toBeGreaterThanOrEqual(bal.feel.stepSeconds - 1e-6);
    expect(w.t - letGo).toBeLessThan(bal.feel.stepSeconds + STEP);
    // Its startup was spent holding: the rest of the heavy row's cycle follows the strike.
```

In `packages/engine/tests/delve-chain-feel.test.ts` ("a manual hold blow charges and fires by itself the same way"):

Replace:
```ts
    tickAfter(struck, bal.chains.holdMax * 1.3);
  });
```
with:
```ts
    // It fires at holdMax, then leaps (a maul's hold lunges further than its medium) and
    // strikes as it lands (see the weapon flow spec).
    tickAfter(struck - bal.feel.stepSeconds, bal.chains.holdMax * 1.3);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-chains.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 7 failed, 117 passed (124): "a manual hold blow charges and fires by itself the same way" (delve-chain-feel); the five `a hold blow's leap` tests (each `expected { kind: 'basic', … } to be undefined`: the blow strikes as it is let go); "a manual hold blow holds at its strike point…" (delve-chains). The determinism test already passes; it guards the new motion.

- [ ] **Step 3: `swing.released`**

In `packages/engine/src/types/arpg.ts`:

Before:
```ts
  } | null;
  /** Each running push (a lunge, a step-in, a step or a recoil), in the order they began. */
```
add:
```ts
    /**
     * A manual hold blow let go at stage 1 or 2 whose row lunges further than
     * medium's: the stage it was let go at. It leaps the rest, then strikes at
     * `strikeAt` (see the weapon flow spec). Else null.
     */
    released: number | null;
```

- [ ] **Step 4: The leap**

In `packages/engine/src/arpg/basic.ts` (a new swing isn't released; `basicHoldTick`'s comment and its release):

Before:
```ts
  };
  h.nextAttackAt = t + cycle;
```
add:
```ts
    released: null,
```

Replace:
```ts
 * was aimed. A tap (let go by its strike point) strikes where it began.
 */
```
with:
```ts
 * was aimed. A tap (let go by its strike point) strikes where it began. One let
 * go at stage 1 or 2 whose row lunges further than medium's leaps the rest
 * first, over `stepSeconds` toward where it re-aimed, stopping at its foe (the
 * re-aimed target, else the first ahead), and strikes as it lands (see the
 * weapon flow spec).
 */
```

Replace:
```ts
    if (t > sw.held + 1e-9) {
      const w = h.stats.weapon;
      const { acquire } = swingReach(w, w.feel.medium, true);
      const { target, dir } = aimAt(ctx, aim, acquire, sw.dir);
      sw.dir = dir;
      sw.targetId = target?.id ?? null;
      h.facing = dir;
    }
    return strike(ctx, steer, full ? 2 : stage);
```
with:
```ts
    const w = h.stats.weapon;
    let target: MonsterEntity | null = null;
    if (t > sw.held + 1e-9) {
      const { acquire } = swingReach(w, w.feel.medium, true);
      const aimed = aimAt(ctx, aim, acquire, sw.dir);
      target = aimed.target;
      sw.dir = aimed.dir;
      sw.targetId = target?.id ?? null;
      h.facing = sw.dir;
    }
    const at = full ? 2 : stage;
    const row = w.feel[HOLD_STAGE_KINDS[at]];
    const leap = at > 0 ? row.move - w.feel.medium.move : 0;
    if (leap <= 0) return strike(ctx, steer, at);
    const { reach } = swingReach(w, row, true);
    const foe = target ?? foeAhead(ctx, sw.dir, reach + leap, row.arc ?? w.arc);
    startPush(ctx, 'lunge', sw.dir, leap, bal.feel.stepSeconds, foe?.id ?? null);
    sw.released = at;
    sw.strikeAt = t + bal.feel.stepSeconds;
    return;
```

- [ ] **Step 5: A leap counts as striking**

In `packages/engine/src/arpg/action.ts`:

Replace:
```ts
 * A basic swing in its startup strikes this tick. A press or a hold that would
 * start now waits a tick, so the blow lands first (see the chain feel spec).
 */
export function swingStrikes(h: HeroEntity, t: number): boolean {
  return !!h.swing && h.swing.held === null && t >= h.swing.strikeAt - 1e-9;
```
with:
```ts
 * A basic swing in its startup strikes this tick, or a released hold blow is
 * leaping (it strikes as it lands). A press or a hold that would start now
 * waits, so the blow lands first (see the chain feel and weapon flow specs).
 */
export function swingStrikes(h: HeroEntity, t: number): boolean {
  const sw = h.swing;
  return !!sw && (sw.released !== null || (sw.held === null && t >= sw.strikeAt - 1e-9));
```

- [ ] **Step 6: The strike as it lands**

In `packages/engine/src/arpg/step.ts` (the automatic-mode block leaves a released swing alone; a released swing strikes at `strikeAt`):

Replace:
```ts
  // dropped.
  if (input.attack === undefined && h.swing) {
    const target = h.swing.targetId;
```
with:
```ts
  // dropped. A released hold blow's leap goes on whatever the input does now.
  if (input.attack === undefined && h.swing && h.swing.released === null) {
    const target = h.swing.targetId;
```

Replace:
```ts
    // A manual hold blow holds at its strike point while the attack stays held.
    if (input.attack !== undefined && h.stats.weapon.blows[h.swing.step].kind === 'hold')
      basicHoldTick(ctx, input.attack, dt, input.attackAim ?? null, v);
```
with:
```ts
    // A released hold blow strikes as its leap lands; a manual hold blow holds at its strike
    // point while the attack stays held.
    if (h.swing.released !== null) strike(ctx, v, h.swing.released);
    else if (input.attack !== undefined && h.stats.weapon.blows[h.swing.step].kind === 'hold')
      basicHoldTick(ctx, input.attack, dt, input.attackAim ?? null, v);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-chain-feel.test.ts tests/delve-chains.test.ts tests/delve-weapon-flow.test.ts)`
Expected: 124 passed.

- [ ] **Step 8: The whole engine suite and the typecheck**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 1341 tests pass in 76 files (the pacing rails hold).

- [ ] **Step 9: Commit**

First check `git diff packages/engine/tests/delve-chain-feel.test.ts` shows only the `tickAfter` change, one line out and three in (see "One stray byte").

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/step.ts
git add packages/engine/tests/delve-weapon-flow.test.ts packages/engine/tests/delve-chains.test.ts packages/engine/tests/delve-chain-feel.test.ts packages/engine/src/types/arpg.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/action.ts packages/engine/src/arpg/step.ts
git commit -m "feat(engine): a charged hold blow leaps as it is let go, then strikes as it lands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 6: Balance

### Task 7: Measure before and after, and record it

No tuning (the spec: measure, and if a rail breaks, stop). This task builds the engine, measures the DPS Lab grid and the pacing rails against the "before" files Task 1 checked, and records them in the spec's status line. The numbers are deterministic: each must match the plan's. **If a pacing rail breaks** (`delve-pacing.test.ts` failed in any of Tasks 1–6, or a line below reads outside its bounds), stop: don't tune anything, and bring the before and after numbers to the user. The fix is their call.

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md:3` (the status line)

- [ ] **Step 1: Build the engine and measure**

Run: `(cd packages/engine && pnpm build)`
Expected: tsup's "Build success" lines.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/flow-before && node snapshot.mjs C:/Projects/Alloy/packages/engine/dist/index.js after-depth10.json)`
Expected: `runs 9144 ms …` (about 10 s).

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/flow-before && node compare.mjs before-depth10.json after-depth10.json)`
Expected, exactly:

```text
basics: median +0.0% [+0.0%, +0.0%] (504 rows); identical: 504; over 1%: 0
abilities: median +0.0% [-54.8%, +140.6%] (8640 rows)
  changed: 1683 rows, median +0.5% [-54.8%, +140.6%] (1683 rows); up 1124, down 559; forms bolt, volley, lance; the grid's total +0.8%
  mana   light   median +0.0% [-21.7%, +52.4%] (576 rows)
  mana   medium  median +0.0% [-15.6%, +42.8%] (576 rows)
  mana   heavy   median +0.0% [-15.1%, +6.9%] (576 rows)
  mana   hold    median +0.0% [-10.0%, +9.4%] (576 rows)
  mana   default median +0.0% [-18.4%, +15.5%] (576 rows)
  cast   light   median +0.0% [-54.8%, +15.3%] (576 rows)
  cast   medium  median +0.0% [-5.3%, +40.1%] (576 rows)
  cast   heavy   median +0.0% [-4.7%, +140.6%] (576 rows)
  cast   hold    median +0.0% [-10.0%, +5.9%] (576 rows)
  cast   default median +0.0% [-37.6%, +71.6%] (576 rows)
  charge light   median +0.0% [+0.0%, +0.0%] (576 rows)
  charge medium  median +0.0% [+0.0%, +0.0%] (576 rows)
  charge heavy   median +0.0% [+0.0%, +0.0%] (576 rows)
  charge hold    median +0.0% [-34.6%, +101.8%] (576 rows)
  charge default median +0.0% [+0.0%, +0.0%] (576 rows)
  bolt      median +0.0% [-37.6%, +140.6%] (1080 rows)
  volley    median +0.0% [-54.8%, +49.7%] (1080 rows)
  lance     median +0.0% [-34.6%, +101.8%] (1080 rows)
  burst     median +0.0% [+0.0%, +0.0%] (1080 rows)
  strike    median +0.0% [+0.0%, +0.0%] (1080 rows)
  nova      median +0.0% [+0.0%, +0.0%] (1080 rows)
  barrage   median +0.0% [+0.0%, +0.0%] (1080 rows)
  maelstrom median +0.0% [+0.0%, +0.0%] (1080 rows)
rows that stopped dealing damage: 0
```

The spec's gate is the first line: the basic grid identical (any row over 1% would be listed under it, with its strikes, and must be explained before going on). The ability grid's shift is expected and reported, not gated.

Run: `(cd /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/flow-before && node pacing.mjs C:/Projects/Alloy/packages/engine/dist/index.js | tee pacing-after.txt)`
Expected, exactly (about a minute):

```text
first dive: 11, 11, 11, 13 (each ≥ 3), mean 11.5 (4–12)
dive 6 mean 25.5, dive 12 mean 35 (> dive 1 + 5, > dive 6)
frost: dive 1 8.5, dive 12 32.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 6 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 27, 21–37 (allowed 16.2–43.2): fire+frost 30, earth+frost 27, storm+fire 37, frost+storm 26, fire+shadow 34, fire+nature 34, shadow+nature 21, fire+earth 30, storm+earth 27, earth+shadow 34, earth+nature 21, frost+shadow 26, frost+nature 22, storm+shadow 32, storm+nature 21
seconds per floor: 20.89 (8–60)
```

and `pacing-before.txt` reads:

```text
first dive: 12, 12, 5, 3 (each ≥ 3), mean 8 (4–12)
dive 6 mean 27.75, dive 12 mean 35.75 (> dive 1 + 5, > dive 6)
frost: dive 1 10, dive 12 26.5 (≥ dive 1 + 5)
legendaries owned at dive 12: 4.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 28, 18–41 (allowed 16.8–44.8): fire+frost 32, earth+frost 21, storm+fire 18, frost+storm 29, fire+shadow 30, fire+nature 22, shadow+nature 26, fire+earth 28, storm+earth 29, earth+shadow 41, earth+nature 30, frost+shadow 23, frost+nature 22, storm+shadow 36, storm+nature 20
seconds per floor: 29.09 (8–60)
```

Every line is inside its bounds. If any number differs from these, stop and find out why before going on (the sim is deterministic, so a difference means the code differs from the plan's).

- [ ] **Step 2: The client still passes against the new bundle**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 716 tests pass in 89 files (Task 8 changes the client).

- [ ] **Step 3: The spec's status line**

In `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md` (LF):

Replace:
```markdown
**Status:** approved design, 2026-09-29. It follows v0.47.0 (`2026-09-29-delve-chain-feel-design.md`) and ships as v0.48.0.

```
with:
```markdown
**Status:** approved design, 2026-09-29. It follows v0.47.0 (`2026-09-29-delve-chain-feel-design.md`) and ships as v0.48.0, built at the starting values below: nothing was tuned. Measured before (v0.47.0) and after (the DPS Lab grid at depth 10, one dummy and the pack, one seed; the pacing rails at `tests/delve-pacing.test.ts`'s seeds):
- **DPS Lab.** The basic grid is identical: all 504 rows, to the hundredth. The ability grid moves in 1,683 of its 8,640 rows, all of them Bolt, Volley or Lance (the forms that recoil): the median of those +0.5% (1,124 up, 559 down), from −54.8% to +140.6%, the grid's total +0.8%. By payment and kind every median is +0.0%; the spread is widest in cast rows (light −54.8%, heavy up to +140.6%, default chains −37.6% to +71.6%) and charge holds (−34.6% to +101.8%). Casts per row barely move: basics no longer wait out a recoil, so they swing (and feed mana) sooner and their stacks meet the ability's at other moments, which moves its reactions. No row stopped dealing damage.
- **Pacing.** Every rail holds. First dives 12, 12, 5, 3 (mean 8) → 11, 11, 11, 13 (mean 11.5, under its ceiling of 12); dive 6 and dive 12 means 27.75, 35.75 → 25.5, 35; Frost dive 1 → dive 12, 10 → 26.5 before and 8.5 → 32.5 after; legendaries at dive 12, 4.75 → 6; the own pair's reaction 6 of 6 both; the 15-pair sweep at dive 6, median 28 (18–41) → 27 (21–37); seconds a floor 29.09 → 20.89.

```

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/Alloy
git add docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md
git commit -m "docs: the weapon flow spec's measured before and after: the basic grid identical, every pacing rail holds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
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

`compare.mjs`:

```js
// The weapon flow spec's DPS Lab gates: the depth-10 grid (one dummy and the pack) after the
// change against before (v0.47.0). Basics should come out identical (every row over 1% is
// listed); the ability grid is expected to shift (reported, no gate).
// Usage: node compare.mjs <before.json> <after.json>
import { readFileSync } from 'node:fs';
const [b, a] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;
const med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const stats = (rs) => rs.length ? `median ${pct(med(rs) - 1)} [${pct(Math.min(...rs) - 1)}, ${pct(Math.max(...rs) - 1)}] (${rs.length} rows)` : 'none';
const ratio = (k) => (b[k].dps > 0 ? a[k].dps / b[k].dps : a[k].dps > 0 ? Infinity : 1);
const keys = Object.keys(a);
const basic = keys.filter((k) => a[k].view === 'basic');
const moved = basic.filter((k) => Math.abs(ratio(k) - 1) > 0.01);
console.log(`basics: ${stats(basic.map(ratio))}; identical: ${basic.filter((k) => a[k].dps === b[k].dps && a[k].casts === b[k].casts).length}; over 1%: ${moved.length}`);
for (const k of moved) console.log(`  ${k} ${b[k].dps} -> ${a[k].dps} (${pct(ratio(k) - 1)}), strikes ${b[k].casts} -> ${a[k].casts}`);
const ab = keys.filter((k) => a[k].view === 'ability');
console.log(`abilities: ${stats(ab.map(ratio).filter(Number.isFinite))}`);
const changed = ab.filter((k) => a[k].dps !== b[k].dps);
const cr = changed.map(ratio).filter(Number.isFinite);
const total = ab.reduce((t, k) => t + a[k].dps, 0) / ab.reduce((t, k) => t + b[k].dps, 0);
console.log(`  changed: ${changed.length} rows, ${stats(cr)}; up ${cr.filter((r) => r > 1).length}, down ${cr.filter((r) => r < 1).length}; forms ${[...new Set(changed.map((k) => a[k].dims.form))].join(', ')}; the grid's total ${pct(total - 1)}`);
for (const payment of ['mana', 'cast', 'charge'])
  for (const kind of ['light', 'medium', 'heavy', 'hold', 'default'])
    console.log(`  ${payment.padEnd(6)} ${kind.padEnd(7)} ${stats(ab.filter((k) => a[k].dims.payment === payment && a[k].dims.kind === kind).map(ratio).filter(Number.isFinite))}`);
for (const form of ['bolt', 'volley', 'lance', 'burst', 'strike', 'nova', 'barrage', 'maelstrom'])
  console.log(`  ${form.padEnd(9)} ${stats(ab.filter((k) => a[k].dims.form === form).map(ratio).filter(Number.isFinite))}`);
console.log(`rows that stopped dealing damage: ${keys.filter((k) => b[k].dps > 0 && a[k].dps === 0).length}`);
```

## Chunk 7: Client

### Task 8: The lean follows any swing and the wind-up's facing; a hold blow's charge ends at its release

The anticipation lean (`fx/anticipation.ts`) follows any swing in its startup, committed or not, stops at a hold blow's release (its leap is no wind-up), and leans a wind-up the way the hero faces it (`windupDir`, which the engine now exports), so the lean and the sprite agree past the aim point and on a self-centred form. The HUD's hold-blow charge readout (`useArenaCore.ts`, from `swing.held`) clears at the release.

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts:16,43,78,141,171`
- Modify: `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts:71` (its wind-up's `from`)
- Modify: `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts:105,121`
- Modify: `packages/engine/src/index.ts:212` (export `windupDir`)
- Modify: `packages/client/src/features/delve/arena/fx/anticipation.ts:8,33,77`
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts:194`

- [ ] **Step 1: Write the failing tests**

In `packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts` (the swing fixture gains `released`, the wind-ups `from` and their moves a `form`; the uncommitted swing is followed now; past its aim point a directional wind-up leans along the press's way; a released hold blow stops gathering):

Before:
```ts

function world(over: Partial<ArpgWorld['hero']>): ArpgWorld {
```
add:
```ts
/** A wind-up's form, as the lean reads it (`windupDir`: only a directional form turns past its aim). */
const BOLT = { id: 'bolt' };
```

Replace:
```ts
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
          chains: [
            { moves: [{ element: 'frost', heft: 0.45, last, castTime: 0.4 }], hold: [null] },
          ],
          windup: {
            slot: 0,
            aim: null,
            at: { x: 5, y: 9 },
```
with:
```ts
  released: null,
};

describe('windingUp', () => {
  it('reports a swing in its startup with its heft and progress', () => {
    const a = windingUp(world({ swing } as never))!;
    expect(a.heft).toBeCloseTo(0.8);
    expect(a.progress).toBeCloseTo(0.5);
    expect(a.dir).toEqual({ x: 1, y: 0 });
  });

  it("reports a wind-up with its move's heft (+0.2 for a chain's last), toward where it aims", () => {
    const winding = (last: boolean, from = { x: 5, y: 5 }) =>
      windingUp(
        world({
          chains: [
            {
              moves: [{ form: BOLT, element: 'frost', heft: 0.45, last, castTime: 0.4 }],
              hold: [null],
            },
          ],
          windup: {
            slot: 0,
            aim: null,
            at: { x: 5, y: 9 },
            from,
```

Replace:
```ts
  });

  it('ignores an uncommitted swing and idle heroes', () => {
    expect(windingUp(world({ swing: { ...swing, committed: false } } as never))).toBeNull();
```
with:
```ts
    // Begun below its aim point, now past it: it leans along the press's way, as the hero faces.
    expect(winding(false, { x: 5, y: 12 }).dir).toEqual({ x: 0, y: -1 });
  });

  it('follows an automatic swing on the move too, and ignores idle heroes', () => {
    const moving = windingUp(world({ swing: { ...swing, committed: false } } as never))!;
    expect(moving.progress).toBeCloseTo(0.5);
```

Replace:
```ts
    const stage = (castTime: number) => ({ element: 'fire', heft: 0.6, last: false, castTime });
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.3)], hold: [[stage(0.3), stage(0.5), stage(0.7)]] }],
        windup: {
          slot: 0,
          aim: null,
          at: { x: 9, y: 5 },
```
with:
```ts
    const stage = (castTime: number) => ({
      form: BOLT,
      element: 'fire',
      heft: 0.6,
      last: false,
      castTime,
    });
    const a = windingUp(
      world({
        chains: [{ moves: [stage(0.3)], hold: [[stage(0.3), stage(0.5), stage(0.7)]] }],
        windup: {
          slot: 0,
          aim: null,
          at: { x: 9, y: 5 },
          from: { x: 5, y: 5 },
```

After:
```ts
    expect(full.heft).toBeCloseTo(FEEL.hold.heft); // stage 2: full power at 100%
  });
```
add:
```ts

  it('a hold blow let go stops gathering: its leap is no wind-up', () => {
    const leaping = { ...swing, strikeAt: 1.1, held: 0.2, released: 2 };
    expect(windingUp(world({ swing: leaping } as never))).toBeNull();
  });
```

In `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts` ("the hand"'s wind-up, whose `from` and form the lean now reads):

Replace:
```ts
        { moves: [{ element: 'frost', heft: 0.45, last: false, castTime: 0.4 }], hold: [null] },
      ],
      windup: {
        slot: 0,
        aim: null,
        at: { x: 9, y: 5 },
```
with:
```ts
        {
          moves: [
            { form: { id: 'bolt' }, element: 'frost', heft: 0.45, last: false, castTime: 0.4 },
          ],
          hold: [null],
        },
      ],
      windup: {
        slot: 0,
        aim: null,
        at: { x: 9, y: 5 },
        from: { x: 5, y: 5 },
```

In `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts` (an unarmed hold blow let go at stage 1 leaps: its heavy row lunges 0.5 against its medium's 0.4):

Replace:
```ts
  it("shows the basic chain's next blow and a manual hold blow's charge", () => {
    const sword = sandbox();
```
with:
```ts
  it("shows the basic chain's next blow and a manual hold blow's charge until it is let go", () => {
    const sword = sandbox();
```

Before:
```ts
  });

  it("shows a slot's beat as its wait (the longer of it and the move's cooldown), flagged as a beat", () => {
```
add:
```ts
    // Let go at stage 1: an unarmed heavy lunges further than a medium, so it leaps first.
    stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(w.hero.swing).toMatchObject({ released: 1 });
    expect(snapshot(w).basicHold).toBeNull();
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/anticipation.test.ts src/features/delve/arena/fx/__tests__/mana-fx.test.ts src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: 4 failed, 33 passed (37): "reports a wind-up with its move's heft…" (`expected { x: +0, y: 1 } to deeply equal { x: +0, y: -1 }`), "follows an automatic swing on the move too…", "a hold blow let go stops gathering…" (anticipation), and "shows the basic chain's next blow and a manual hold blow's charge until it is let go" (arena-hud-snapshot).

- [ ] **Step 3: Export `windupDir` and rebuild the engine**

In `packages/engine/src/index.ts`:

Before:
```ts
} from './arpg/abilities/cast.js';
```
add:
```ts
  windupDir,
```

Run: `(cd packages/engine && npx tsc --noEmit -p . && pnpm build)`
Expected: no type errors; tsup's "Build success" lines.

- [ ] **Step 4: The lean and the readout**

In `packages/client/src/features/delve/arena/fx/anticipation.ts` (the import, `windingUp`'s comment and its swing branch, and the wind-up's direction):

Before:
```ts
  type ArpgWorld,
```
add:
```ts
  windupDir,
```

Replace:
```ts
 * The action the hero is winding up right now (a committed swing, an ability
 * or a hold charging), or null. A blow winds up in its own element; a hold
 * (an ability's, or a manual blow held at its strike point) gathers with its
 * charge, as heavy as the stage it has reached, toward `aim` (the aim
 * marker's point, where its release will go) while one shows. A released
 * hold's wind-up carries on from what the charge already counted of it.
 */
export function windingUp(w: ArpgWorld, aim: Vec | null = null): WindingUp | null {
  const h = w.hero;
  const bal = getDelveRegistry().getDelveBalance();
  if (h.swing?.committed) {
```
with:
```ts
 * The action the hero is winding up right now (a swing in its startup, an
 * ability or a hold charging), or null. A blow winds up in its own element; a
 * hold (an ability's, or a manual blow held at its strike point) gathers with
 * its charge, as heavy as the stage it has reached, toward `aim` (the aim
 * marker's point, where its release will go) while one shows; a hold blow's
 * ends as it is let go (its leap is no wind-up). A released hold's wind-up
 * carries on from what the charge already counted of it. A wind-up leans the
 * way the hero faces it (`windupDir`).
 */
export function windingUp(w: ArpgWorld, aim: Vec | null = null): WindingUp | null {
  const h = w.hero;
  const bal = getDelveRegistry().getDelveBalance();
  if (h.swing) {
    if (h.swing.released !== null) return null;
```

Replace:
```ts
      dir: toward(w, h.windup.at),
      heft: stepHeft(ab),
```
with:
```ts
      dir: windupDir(h, h.windup) ?? { ...h.facing },
      heft: stepHeft(ab),
```

In `packages/client/src/features/delve/arena/useArenaCore.ts` (`snapshot`):

Replace:
```ts
  const held = h.swing?.held ?? null;
  return {
```
with:
```ts
  // A hold blow's charge shows until it is let go (not through its leap).
  const held = h.swing?.released === null ? h.swing.held : null;
  return {
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/anticipation.test.ts src/features/delve/arena/fx/__tests__/mana-fx.test.ts src/features/delve/__tests__/arena-hud-snapshot.test.ts)`
Expected: 37 passed.

- [ ] **Step 6: The whole client suite and the typecheck**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 717 tests pass in 89 files.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/index.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git add packages/engine/src/index.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts
git commit -m "feat(client): the lean follows any swing and the wind-up's facing; a hold blow's charge ends at its release" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Chunk 8: Release: docs, version, verification

### Task 9: Docs, the version, and the full verification

The Delve E2E specs pass unchanged (on the scratch copy: 60 passed in 3.0 minutes), so they run here, in the full verification.

**Files:**
- Modify: `CLAUDE.md` (the Delve paragraph and its Spec, Engine, Data and DPS Lab bullets; CRLF: hand-edit)
- Modify: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md` (CRLF: hand-edit), `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md:320`, `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md:76` (CRLF: hand-edit)
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: CLAUDE.md**

In `CLAUDE.md` (CRLF: hand-edit; each edit replaces part of a line in the Delve section).

Replace:
```markdown
Every attack and ability runs startup → strike → recovery: committed blows lunge in, shots and bolts recoil, a move's kind sets its conjure, and Burst is thrown (spec: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`).
```
with:
```markdown
Every attack and ability runs startup → strike → recovery: a move's kind sets its conjure, forward forms step in and Bolt, Volley and Lance recoil, and Burst is thrown (spec: `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md`). Nothing roots the hero: while a swing, a charging hold blow, a wind-up or a charging hold runs it walks at `actionMove` (0.6×), facing the action, and every blow's and form's motion adds on top of the steering, less any part against it. Each weapon moves its own way, its rows' `move`, `side` and `hop` growing with the kind: the dagger darts in and hops out, the sword steps in and lunges, the axe wades, the maul plants then leaps (a charged hold blow leaps as it is let go, then strikes), the staff sways side to side, the wand circles its target and the bow steps back (spec: `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md`).
```

Replace:
```markdown
chain feel (tempo, holds, beats): `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md`
```
with:
```markdown
chain feel (tempo, holds, beats): `docs/superpowers/specs/2026-09-29-delve-chain-feel-design.md`; weapon flow (motion, no rooting): `docs/superpowers/specs/2026-09-29-delve-weapon-flow-design.md`
```

Replace:
```markdown
`action.ts` pushes (lunges, step-ins, recoils) and cancels, `basic.ts` the basic attack's swings and strikes,
```
with:
```markdown
`action.ts` pushes (`HeroEntity.pushes`: a swing's `lunge`, a form's `stepIn`, a blow's or a form's recoil's `step`; each adds a slice a tick on top of the steering, less any part against it, cut at its stop foe's contact gap) and cancels, `basic.ts` the basic attack's swings, strikes and steps (a blow's step back, side step and hop from its strike, the side by the steering or the weapon's `sway`, `HeroEntity.swaySide`; a charged hold blow's leap, `swing.released`),
```

Replace:
```markdown
a press or hold due in the tick a swing strikes waits a tick, and that tick doesn't age it)
```
with:
```markdown
a press or hold due in the tick a swing strikes waits a tick, and that tick doesn't age it; so do they through a charged hold blow's leap, which counts as striking: `swingStrikes`)
```

Replace:
```markdown
`cast.ts` handles payment, per-move cooldowns, wind-ups,
```
with:
```markdown
`cast.ts` handles payment, per-move cooldowns, wind-ups (`windupDir`: a directional form the hero has walked past its aim point fires along the press's way),
```

Replace:
```markdown
`delve.feel` the combat-weight timings: conjure, recovery, heft, buffer;
```
with:
```markdown
`delve.feel` the combat-weight timings: conjure, recovery, heft, buffer, and the weapon flow's `stepSeconds`, `actionMove` and `sideSteer`;
```

Replace:
```markdown
positions held (the hero and the dummies put back after every step, knockback zeroed)
```
with:
```markdown
positions held (the dummies put back after every step, knockback zeroed; the hero back to its start plus what its running pushes have moved it, so a lunge plays out)
```

- [ ] **Step 2: The superseded notes**

In `docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md` (CRLF: hand-edit): the Hades commit decision, committed and free, the push, the tick's steps 5 and 7, the swing gate, automatic mode's acquisition, the `move` definition, and the lean.

Before:
```markdown
## The action model (engine)
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): the Hades commit gives way to flow. No action roots the hero: while a swing (startup to strike), a manual hold blow charging, a wind-up or a charging hold runs, it walks at `actionMove` (0.6×) of its pace (a recovery's slower `recoveryMove` wins), facing the action, so steering strafes. The dodge still cancels anything.

```

Before:
```markdown
### Hero state
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): nothing roots the hero: a wind-up and a dash still hold presses, but a swing's `committed` flag now only decides whether it leaves a recovery (moving during an automatic swing's startup clears it).

```

Before:
```markdown
### `heroTick` order
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): `HeroEntity.pushes` replaces `push`: a list of running pushes, each `{ kind, dx, dy, start, until, stopId, done, movedX, movedY }` (`lunge`, `stepIn` or `step`). Each tick the hero first moves by its steering, then each push adds its slice (its progress change times its displacement; none in a lunge's planted part), clamped to the arena, less any part against the steering; one with a stop foe is cut at that foe's contact gap. A cast no longer clears pushes: `cancelSwing` and the strike end the swing's lunge, a wind-up landing finishes its own step-in, and a dodge clears them all.

```

Before:
```markdown
### Cancels

- **Dodge** cancels any phase:
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): in step 5 nothing roots: the steering moves the hero (slowed while it acts or recovers), then every push adds its slice on top; `h.moving` means steering and not dashing. In step 7 a new swing no longer waits for a push to finish.

```

Before:
```markdown
- **Weapon swap** (`refreshWorldHero`) to a different weapon base drops a swing in progress (and its lunge), resets the string to its first step and readies the weapon (`nextAttackAt` no later than now). Gear with the same weapon base leaves the swing alone.
```
add:
```markdown

  > **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): a swing no longer waits for a push: pushes add up, so a recoil or a blow's step runs on through the next swing.
```

Before:
```markdown
## Basic attacks: weapon combo strings
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): every swing, committed or not, lunges and acquires within `range + reach + move` (+1 for a manual swing). Moving during an automatic swing's startup clears `committed` only for the recovery: its lunge runs on, blended with the steering.

```

Before:
```markdown
**Direction.** The swing's direction is set when it starts (aim, else the target, else the facing) and doesn't track afterwards. The lunge closes the gap instead.
```
add:
```markdown
> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): a forward `move` is every swing's lunge, committed or not. A negative `move`, a `side` and a `hop` (new, per kind) make the blow's step: one push from the strike over `stepSeconds` (0.15), the step back and the hop away from the attack, the side step square to it (the steering's side, else the weapon's `sway`). `recoilSeconds` is only for the forms' recoils.

```

Before:
```markdown
  - The **hand** is 0.6 units from the hero toward the aim, at chest height (past the sprite's edge). Casts fling their mana from it.
```
add:
```markdown
    - **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): the lean follows any swing in its startup, committed or not, and a hold blow's ends as it is let go.
```

In `docs/superpowers/specs/2026-09-25-delve-ability-system-design.md` (LF), under Testing:

Replace:
```markdown
  - cast wind-up (roots, delays, waits for other buttons);
  - Ward absorbs and bursts, Armor reduces and retaliates;
```
with:
```markdown
  - cast wind-up (roots, delays, waits for other buttons; superseded by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): a wind-up no longer roots, the hero walks at `actionMove`, facing it);
  - Ward absorbs and bursts, Armor reduces and retaliates;
```

In `docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md` (CRLF: hand-edit), after the chain feel's note under Hold:

Before:
```markdown
- **Hold-to-repeat.** A held button doesn't re-press while the next move is a hold: the pad frame sends `holding` instead. So "quick, quick, hold, heavy" under a held button plays quick, quick, then charges until the button lifts, then heavy on the next press.
```
add:
```markdown

> **Superseded** by `2026-09-29-delve-weapon-flow-design.md` (v0.48.0): a charging hold no longer roots the hero: it walks at `actionMove` (0.6×), facing the hold's aim, and starting one (like any cast) cancels a swing still in its startup, its lunge with it, but leaves other pushes, such as a blow's step, running. A manual hold blow let go at stage 1 or 2 whose row lunges further than medium's leaps the rest over `stepSeconds` toward where it re-aimed, then strikes as it lands.
```

- [ ] **Step 3: Commit the docs**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-25-delve-combat-weight-design.md docs/superpowers/specs/2026-09-25-delve-ability-system-design.md docs/superpowers/specs/2026-09-29-delve-moves-and-chains-design.md
git commit -m "docs: weapon flow in the Delve notes; the combat-weight, ability and chains specs' rooting superseded" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: The version**

In `packages/client/package.json`:

Replace:
```json
  "version": "0.47.0",
  "private": true,
```
with:
```json
  "version": "0.48.0",
  "private": true,
```

- [ ] **Step 5: The full verification**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run && pnpm build)`
Expected: no type errors; all 1341 tests pass (76 files); the build succeeds.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all 717 tests pass (89 files).

Run: `(pnpm -F @alloy/client build) && grep -l '0\.48\.0' packages/client/dist/assets/*.js`
Expected: the build succeeds (Vite's warning about chunks over 500 kB is expected), and grep prints one file, `packages/client/dist/assets/index-<hash>.js`: the bundle carries the new version.

Run (the TypeScript files this plan touched, but `targeting.ts`, from the spec's commit): `(files=$(git diff --name-only 71fef72 HEAD -- '*.ts' '*.tsx' | grep -v abilities/targeting.ts); echo "$files" | wc -l; npx prettier --check $files)`
Expected: `24` (the 23 files the commit blocks formatted, and `delve-chain-feel.test.ts`), then "All matched files use Prettier code style!".

Create `packages/client/playwright.scratch.config.ts` from the header (never commit it). Run the PowerShell block under "Dev server on 5288" (the version shows in the TabBar); expect `True`. Then: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: 60 passed, 15 on each of the four devices (about 3 minutes). A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness; a consistent failure is a regression: debug it, don't lengthen a timeout.

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 6: Commit the version**

```bash
cd /c/Projects/Alloy
git add packages/client/package.json
git commit -m "chore(client): bump version to 0.48.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Don't push: the controller pushes after the final review.
