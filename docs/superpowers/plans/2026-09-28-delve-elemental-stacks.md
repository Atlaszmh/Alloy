# Delve Elemental Stacks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elemental marks become stacks: every hit applies a count of its elements to the foe (a blow 1, a finisher 2, an ability's direct hit by weight, everything else 1), the count is the status and its strength along a diminishing curve, and a hit pairs its element's stacks off against another element's earlier stacks to fire the pair's reaction: a damage reaction takes every pair and adds its bonus per pair, an effect reaction fires once and takes one pair, and a 1 s per-foe lockout spaces reactions out.

**Architecture:** The engine owns it. `StatusState` loses its per-status timers for `stacks`/`stackUntil` (one count and one timer per element) plus `burnRef`/`poisonRef` and `reactionLockUntil`; every status reads the counts (`combat.ts` predicates, `step.ts` ticks and slow, `hitMonster`'s shock and hex bonus), burn, poison, shock and hex through `stackIntensity` (`perStack × curve[stacks]`). `applyStatus` maps a status to its element through `BASIC_STATUS`'s inverse (the map moves from `basic.ts` to `combat.ts`) and adds `n` stacks (`applyStacks`); frost freezes only on crossing `freezeAt`, checked once per hit. Every hit carries its count (`HitOpts.stacks`, `Projectile.stacks`, `ResolvedAbility.stacks`; the default is `stacks.tick`), and the basic attack's 30% roll goes. Pairing replaces `findReaction`/`useUpMark` with `findPair`/`consumePairs` in the spec's exact order; `DAMAGE_REACTIONS` decides how many pairs a reaction takes, and `react` scales the damage reactions by them. The numbers live in a new `balance.json → delve.stacks`. The client only draws: stack pips under each foe, a ×n reaction label, the Training meter summing pairs, and texts that say stacks.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), Zod 3, React 19, PixiJS 8, Playwright (a scratch screenshot pass and the Delve E2E specs).

**Spec:** `docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md` at `764c8c2` (the requirements; read it first, twice: the Pairing and Freeze sections carry ordering rules the code follows exactly).

---

## Gate decision: read before executing

Everything below was built and run on a scratch copy of HEAD `764c8c2`, the DPS Lab gate included. It ships the spec's starting values but one, which the gate raised, first in the spec's tuning order:

| Knob | Spec's start | This plan | Why |
|---|---|---|---|
| `firePerStack`, `shockPerStack`, `hexPerStack` | 0.35, 0.08, 0.06 | the same | |
| `poisonPerStack` | 0.6 | 1.7 | at 0.6 two hard gates fail and so does the pacing sweep: the Balanced mana Nature Bolt loses 24%, the fused/single Burst ratio grows 35% (the Frost+Fire and Frost+Earth Bursts Melt or Shatter two or three pairs a hit), and Storm+Nature stalls at depth 12 (floor 17.4). A per-stack value moves the ratio only by lifting the best single-element Burst, the Nature one: 1.0 fixes the Bolt, 1.65 is the first value under +10% (1.6: +10.5%), and 1.7 leaves a margin. The lockout, next in the order, isn't needed (at 1.0, even a 2 s lockout leaves +25%) |
| `reactionLockout`, `curve`, `freezeAt`, `basicFinisher`, `cap`, `duration` | as the spec | the same | |

The pacing rails and the hard gates on those values:

| | Result | |
|---|---|---|
| Pacing rails | first dives 11, 11, 11, 3 (mean 9); dive 6 31, dive 12 41; Frost 7.5 → 29; 6.75 legendaries; own reaction 6 of 6; the 15-pair sweep's median 29, 22–40 (allowed 17.4–46.4); 30.8 s a floor | hold (seed 4's first dive sits on the floor, depth 3) |
| H1. No single-element basic, any weapon, one dummy, loses more than 15% (40-seed means) | worst −0.6% (the Frost sword) | pass |
| H2. No single-element Balanced mana Bolt, Burst or Nova, one dummy, loses more than 15% (40-seed means) | worst −0.1% (the Frost Bolt) | pass |
| H3. The Nature+Fire Burst in the pack stays under twice its pre-stacks figure | at most ×1.31 | pass |
| H4. The best fused Burst's ratio to the best single-element Burst, one dummy, grows 10% at most | ×2.45 → ×2.62 (+7.1%) | pass |

The report the balance review reads (not tuned to; 40-seed means unless marked):

| | One dummy | Pack |
|---|---|---|
| Single-element basics, by weapon | Fire +11% to +49%; Storm +8% to +14%; Shadow +5% to +9%; Nature +18% to +97%; Frost and Earth −0.6% to +0.1% | Fire +11% to +44%; Storm +8% to +15%; Shadow +5% to +11%; Nature +18% to +125%; Frost and Earth −1.4% to +0.2% |
| Pair basics, median [min, max] over both orders and every weapon | Storm+Nature +77% [+9%, +84%]; Frost+Earth +54% [0%, +109%]; Earth+Nature +47% [0%, +86%]; Frost+Nature +21%; Fire+Frost +20% [−16%, +31%]; Fire+Earth +18%; Fire+Nature +15% [−12%, +47%]; Storm+Earth +11%; Frost+Shadow +8%; Storm+Shadow +7%; Frost+Storm +6%; Earth+Shadow +5%; Shadow+Nature +3% [−42%, +36%]; Fire+Storm −4% [−13%, +12%]; Fire+Shadow −6% [−31%, +15%] | Storm+Nature +58%, Fire+Storm +46% [−22%, +69%], Earth+Nature +35%, Frost+Earth +33%, Fire+Nature +21%, Shadow+Nature +19% [−51%, +67%], Fire+Frost +15%, Frost+Nature +15%, Fire+Earth +14%, the rest +5% to +9%; Fire+Shadow −5% [−30%, +15%] |
| Pairs in or out of the basics top 30 | 7 pairs → 7: in Storm+Nature and Earth+Nature; out Fire+Shadow and Fire+Storm | 10 pairs → 7: out Fire+Shadow, Fire+Earth and Frost+Earth |
| Single-element abilities by element, median [min, max] (every form, weight and payment) | Fire +3.6% [−20%, +335%]; Storm +6.5% [−9%, +46%]; Shadow +4.9% [−5%, +25%]; Nature +5.1% [−19%, +338%]; Frost and Earth 0% [−8%, +8%]. Fire and Nature Novas and Barrages gain most (the Crushing cast Nova ×4.4); Swift and Light ones, mostly charge-paid, lose up to 20% | |
| Fused Bursts, the best of each pair (one seed) | Frost+Earth ×2.7 and Frost+Fire ×2.5; Storm+Nature +23%, Storm+Shadow +21%, Shadow+Nature +14%, Fire+Shadow +11%; the others +2% to +7%; Fire+Nature −18% and Frost+Nature −30% | |

What stands out: the fused Frost+Fire and Frost+Earth Bursts at ×2.5–2.7 today's, and Nature's gains, which `poisonPerStack` 1.7 brings with it (the price of keeping the Nature Burst the best single-element one for H4). If that trade isn't wanted, the order's next knob gives a milder one: `poisonPerStack` 1.4 with a 1.25 s lockout also passes every gate (H4 +9.0%; Nature basics up to +76% rather than +97%). Approving this plan accepts the values above; Task 6 re-measures everything and stops if the numbers differ from the ones recorded here.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task.** Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`. The commit bodies of Tasks 2–4 must also carry the line `Pacing rails (tests/delve-pacing.test.ts) not run: the stacks model is whole only after Task 5 (they pass on the scratch copy).`, which their blocks pass as a second `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1, run from the repo root). Of the files this plan touches, these are not clean at HEAD and are **never formatted**, only hand-edited: `packages/engine/src/types/ability.ts` and `packages/engine/src/arpg/abilities/resolve.ts` (CRLF; content already Prettier-style), `packages/engine/src/data/balance.json` and `packages/engine/src/data/arpg.json` (hand-laid-out JSON), `CLAUDE.md` and both spec docs (Markdown, CRLF). Every other existing file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** `types/ability.ts`, `abilities/resolve.ts`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md` and `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md` use CRLF; every other file here is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them). The known CRLF files `registry.ts`, `profile-schema.ts`, `autopilot.ts`, `delve-pacing.test.ts` and `App.tsx` aren't touched.
- `arpg/combat.ts` imports from `arpg/abilities/defend.js`, which imports from `combat.js`, and now `basic.ts` imports `BASIC_STATUS` from `combat.js`: only ever read an import inside a function, never at module top level (`STATUS_ELEMENT` is built from `BASIC_STATUS` in the same module, so it is safe).
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back, and the fixture's foes are **Fire** (they resist fire; Frost is their weakness). `dummy(x, y, { element: 'shadow' })` is neutral to fire, frost, earth and nature. Sandbox dummies (`spawnDummies`) are the Training Grounds' own and never die.
- **Tasks 2–4 leave the pacing rails out.** They measure the whole model, which is whole only after Task 5. On the scratch copy they happen to pass after Tasks 2, 3 and 4 too, but from Task 3 on seed 4's first dive ends on the floor (depth 3), so an intermediate that differs in any way could flip them red for no reason. Tasks 2–4 run the engine suite without `tests/delve-pacing.test.ts`; Task 5 runs it whole, and Task 6 checks the rails' numbers.
- The numbers below were measured on the scratch copy of this exact code (the sim is deterministic, so you should see the same).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| All engine tests but pacing | `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine build | `(cd packages/engine && pnpm build)` |
| Client typecheck + tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
| One client test file | `(cd packages/client && npx vitest run <path>)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` (to pick devices use `--project=desktop` with the `=`: a bare `--project desktop` swallows the spec path) |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (Tasks 8–9; create it when needed, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging and the page's state, not guesses or longer timeouts. (On the scratch copy, `delve.spec.ts`, `delve-gamepad.spec.ts` and `delve-training.spec.ts` passed whole: 56 tests on the four devices.)

**The gate's files** live in the plan author's scratchpad, `C:\Users\hahnz\AppData\Local\Temp\claude\c--Projects-Alloy\239f61fd-0a16-4600-a17d-7efef362f2cc\scratchpad\stacks-before` (called `<before>` below; in the Bash tool, `/c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before`). They were made from the pre-stacks engine and must not be regenerated after Task 2: `before-depth10.json` (the DPS Lab grid at depth 10, one dummy and the pack, by `snapshot.mjs`), `before-seeds40.json` (40-seed means of every basic attack, one dummy and the pack, and every single-element ability, one dummy, by `seeds40.mjs`), and the scripts `seeds40.mjs`, `gate.mjs` and `pacing.mjs` that Task 6 runs. All four scripts' texts are at the end of Task 6, in case the folder is gone; Task 1 checks the two `before-*.json` and remakes them from HEAD if they are missing.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/delve.ts` | `DelveBalance.stacks` (the curve and the per-stack values); `status` loses the keys the stacks replace; reaction docs |
| `src/data/schemas.ts` | the `stacks` schema; `status` shrinks; `consumes` goes |
| `src/data/balance.json` | `delve.stacks`; `delve.status` shrinks |
| `src/types/arpg.ts` | `StatusState` (counts, refs, lockout); `ReactionDef.consumes` goes; `Projectile.stacks`; `Zone.applies` goes; `pairs` on the `hit` and `reaction` events |
| `src/types/ability.ts` | `ResolvedAbility.stacks` |
| `src/arpg/world.ts` | `emptyStatus` |
| `src/arpg/combat.ts` | `BASIC_STATUS` (moved here) and its inverse; predicates, `hasMark`, `stackCap`, `stackIntensity`, `applyStacks`, `spreadStacks`; `applyStatus(…, n)`, `crossFreeze`, `addStatus`; `findPair`, `DAMAGE_REACTIONS`, `consumePairs`; `react(…, n)`; `hitMonster`'s order; Inferno and Night's Embrace read counts |
| `src/arpg/step.ts` | lapsing, the burn and poison ticks (along the curve), the slow; basic shots carry their count; the boss slam zone |
| `src/arpg/basic.ts` | no roll: every blow applies its element, `basicBlow`/`basicFinisher`; Twin Fang's extra hit applies nothing |
| `src/arpg/abilities/impact.ts` | `hitOpts` sets `stacks` on direct hits; `leaveZone` |
| `src/arpg/abilities/forms.ts` | the three zones lose `applies` |
| `src/arpg/abilities/resolve.ts` | `stacks: byWeight[weight]` |
| `src/data/arpg.json` | `consumes` goes; the Surge and four element texts say stacks |
| `src/index.ts` | `BASIC_STATUS` exported from `combat.js` |
| `tests/delve-stacks.test.ts` (new) | the spec's engine tests |
| `tests/{delve-reactions,ability-status,ability-forms,arpg-sim,delve-infusion,delve-pair,delve-training,delve-dodge,delve-combat-weight}.test.ts` | updated to stacks |

`src/arpg/abilities/defend.ts` needs no edit: both retaliation paths name no count, so they apply `stacks.tick` (`HitOpts.stacks`' and `applyStatus`'s default), as does Hellfire Brand's corpse explosion in `killMonster`. `tests/delve-dps-sim.test.ts` and `tests/delve-pacing.test.ts` pass unchanged.

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/arena/fx/draw-world.ts` | stack pips on a dark plate under each foe, replacing the hex motes, shock ring, poison dust and rattle chips |
| `features/delve/arena/fx/reactions.ts` | `reactionLabel(id, pairs)`: "MELT! ×2" |
| `features/delve/arena/ArenaRenderer.ts` | the label from `hit.pairs`; the frost tint and burn flicker read stacks |
| `features/delve/training/meter.ts`, `MeterView.tsx` | reaction counts sum the pairs; the note says so |
| `features/delve/AbilitiesPanel.tsx`, `ManaChoice.tsx` | the undiscovered reaction's hint and the basic-status line say stacks |
| tests | `features/delve/arena/fx/__tests__/reactions.test.ts`, `features/delve/__tests__/training-meter.test.ts`, `features/delve/__tests__/AbilitiesPanel.test.tsx`, `pages/__tests__/DelveCamp.test.tsx` |

`packages/client/package.json`: 0.44.0 → 0.45.0 (Task 9). No E2E spec reads statuses or reaction texts (`delve.spec.ts` D04 counts 15 `reaction-unknown` rows, which stays true).

**Docs:** `CLAUDE.md` (the reactions bullet, and the Versioning paragraph: the version is imported in `TabBar.tsx`, not injected by a `define`), the stacks spec's status line, two superseded notes in the pair reactions spec.

---

## Chunk 1: Engine: the balance block

### Task 1: The `delve.stacks` balance block

Added alongside today's numbers; Task 2 removes the `delve.status` keys it replaces, once nothing reads them.

**Files:**
- Modify: `packages/engine/src/types/delve.ts:440` (after `status`)
- Modify: `packages/engine/src/data/schemas.ts:811` (after `status`)
- Modify: `packages/engine/src/data/balance.json:142` (after `"status"`; hand-edit, never format)
- Create: `packages/engine/tests/delve-stacks.test.ts`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-28-delve-elemental-stacks.md
git commit -m "docs: Delve elemental stacks plan" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 1: Check the gate's "before" files**

Task 6 compares against the pre-stacks engine, which exists only until Task 2.

Run: `(ls /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before)`
Expected: `before-depth10.json`, `before-seeds40.json`, `gate.mjs`, `pacing.mjs`, `seeds40.mjs`, `snapshot.mjs`.

If `before-depth10.json` or `before-seeds40.json` is missing, make them now from HEAD (first write any missing script from the texts at the end of Task 6): `(cd packages/engine && pnpm build)`, then `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/snapshot.mjs)` (prints `runs 9144 …`) and `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/seeds40.mjs packages/engine/dist/index.js /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/before-seeds40.json)` (prints `setups 1224`).

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/tests/delve-stacks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import { bal } from './fixtures/arena.js';

// See the elemental stacks spec. The fixture arena's hero stands at (13, 36); `dummy(x, y)` is
// a sturdy Fire foe (it resists fire) that doesn't fight back.

describe('balance: delve.stacks', () => {
  it('loads the stack numbers', () => {
    expect(bal.stacks).toEqual({
      cap: 5,
      duration: { fire: 3, frost: 3, storm: 4, earth: 2, shadow: 6, nature: 4 },
      byWeight: [1, 1, 2, 3, 3],
      basicBlow: 1,
      basicFinisher: 2,
      tick: 1,
      curve: [1, 1.8, 2.45, 3, 3.5],
      freezeAt: 3,
      firePerStack: 0.35,
      frostSlowPerStack: 0.2,
      frostSlowCap: 0.6,
      shockPerStack: 0.08,
      hexPerStack: 0.06,
      poisonPerStack: 1.7,
      reactionLockout: 1,
    });
  });

  it('refuses a cap under 1, a weight list not five long, a one-step curve and a slow cap over 1', () => {
    const parses = (stacks: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, stacks: { ...balanceData.delve.stacks, ...stacks } },
      }).success;
    expect(parses({})).toBe(true);
    expect(parses({ cap: 0 })).toBe(false);
    expect(parses({ byWeight: [1, 2, 3] })).toBe(false);
    expect(parses({ curve: [1] })).toBe(false);
    expect(parses({ frostSlowCap: 1.5 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts)`
Expected: 2 FAIL: "expected undefined to deeply equal { cap: 5, …(14) }" and "expected true to be false" (the schema strips the unknown `stacks`).

- [ ] **Step 4: The type, the schema and the numbers**

In `src/types/delve.ts`, `DelveBalance`: after the `status` block's closing lines

```ts
    freezeImmunity: number;
    rootImmunity: number;
  };
```

add

```ts
  /** Elemental stacks: what each hit applies, and what each count does (see the elemental stacks spec). */
  stacks: {
    /** Most stacks of one element on a foe (Nature's doubles with Plaguebearer). */
    cap: number;
    /** Seconds each element's stacks last; a new stack of it starts the timer again. */
    duration: Record<ManaType, number>;
    /** An ability's direct hit, by weight: Swift, Light, Balanced, Heavy, Crushing. */
    byWeight: number[];
    basicBlow: number;
    /** A combo's finisher, and its discharge of the secondary. */
    basicFinisher: number;
    /** Every other hit that applies statuses: zone ticks, embers, chain jumps, retaliation… */
    tick: number;
    /**
     * How strong 1, 2, 3… stacks of a status are, in per-stack units (cumulative); past its end
     * each stack adds its last step (Plaguebearer's poison).
     */
    curve: number[];
    /** Frost stacks whose crossing freezes. */
    freezeAt: number;
    /** A burn deals its ref × this × `curve` per second. */
    firePerStack: number;
    frostSlowPerStack: number;
    frostSlowCap: number;
    /** Extra damage taken: this × `curve` (doubled by Tempest). */
    shockPerStack: number;
    /** Extra damage taken: this × `curve`. */
    hexPerStack: number;
    /** Poison deals its ref × this × `curve` per second. */
    poisonPerStack: number;
    /** Seconds after a reaction on a foe before another can fire on it. */
    reactionLockout: number;
  };
```

(`ManaType` is already imported there.)

In `src/data/schemas.ts`, `DelveBalanceSchema`: after the `status` object's closing lines

```ts
    freezeImmunity: z.number().min(0),
    rootImmunity: z.number().min(0),
  }),
```

add

```ts
  stacks: z.object({
    cap: z.number().int().positive(),
    duration: perMana(z.number().positive()),
    byWeight: z.array(z.number().int().min(0)).length(5),
    basicBlow: z.number().int().min(0),
    basicFinisher: z.number().int().min(0),
    tick: z.number().int().min(0),
    curve: z.array(z.number().min(0)).min(2),
    freezeAt: z.number().int().positive(),
    firePerStack: z.number().min(0),
    frostSlowPerStack: z.number().min(0),
    frostSlowCap: z.number().min(0).max(1),
    shockPerStack: z.number().min(0),
    hexPerStack: z.number().min(0),
    poisonPerStack: z.number().min(0),
    reactionLockout: z.number().min(0),
  }),
```

In `src/data/balance.json` (hand-edit, keep its layout): after the `delve.status` block's closing lines

```json
      "staggerImmunity": 1.2, "freezeImmunity": 1.5, "rootImmunity": 2
    },
```

add

```json
    "stacks": {
      "cap": 5, "duration": { "fire": 3, "frost": 3, "storm": 4, "earth": 2, "shadow": 6, "nature": 4 },
      "byWeight": [1, 1, 2, 3, 3], "basicBlow": 1, "basicFinisher": 2, "tick": 1,
      "curve": [1, 1.8, 2.45, 3.0, 3.5],
      "freezeAt": 3, "firePerStack": 0.35, "frostSlowPerStack": 0.2, "frostSlowCap": 0.6,
      "shockPerStack": 0.08, "hexPerStack": 0.06, "poisonPerStack": 1.7, "reactionLockout": 1
    },
```

These are the spec's starting values except `poisonPerStack`, which the gate raised from 0.6 to 1.7 (see the Gate decision above; Task 6 re-measures them). The JSON keeps the spec's `3.0`; it loads as 3.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts && npx tsc --noEmit -p .)`
Expected: 2 PASS; no type errors.

Run: `(cd packages/engine && npx vitest run)`
Expected: 73 files, 1155 tests, all green (nothing reads the block yet).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/tests/delve-stacks.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/tests/delve-stacks.test.ts
git commit -m "feat(engine): the delve.stacks balance block" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: Engine: the stack state

### Task 2: Stacks replace the status timers

Every status becomes a count: the state, `applyStatus(…, n)`, lapsing, the ticks, the slow, the shock and hex bonus (burn, poison, shock and hex along the spec's diminishing curve, `stackIntensity`; the slow stays linear), the freeze crossing, and Inferno's and Plague's spread. Reactions stay all-or-nothing for now: `findReaction` walks `hasMark` as today, and `useUpMark` becomes a small interim that zeroes the partner's count (Task 4 replaces both with pairing). Hits still carry no count of their own (they apply `stacks.tick`, 1), and blows still roll (Task 3).

**Files:**
- Modify: `packages/engine/src/types/arpg.ts:133-157` (`StatusState`)
- Modify: `packages/engine/src/types/delve.ts:412-432` (`status`), `:465` (Crystallize's doc)
- Modify: `packages/engine/src/data/schemas.ts:789-805` (`status`)
- Modify: `packages/engine/src/data/balance.json:136-142` (`delve.status`; hand-edit)
- Modify: `packages/engine/src/arpg/world.ts:40-60` (`emptyStatus`)
- Modify: `packages/engine/src/arpg/combat.ts:56-147`, `:176-234`, `:292-324`, `:479-485`, `:554-555`, `:631`, `:639-649`
- Modify: `packages/engine/src/arpg/step.ts:10-19`, `:430-443`, `:479-480`
- Modify: `packages/engine/src/arpg/basic.ts:4`, `:16-24`
- Modify: `packages/engine/src/index.ts:193`, `:202`
- Modify: `packages/engine/tests/delve-stacks.test.ts` (rewritten whole)
- Modify: `packages/engine/tests/{ability-forms,ability-status,arpg-sim,delve-infusion,delve-pair,delve-training,delve-reactions}.test.ts` (Step 6)

- [ ] **Step 1: Write the failing tests**

Replace the whole of `packages/engine/tests/delve-stacks.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import balanceData from '../src/data/balance.json';
import { BalanceConfigSchema } from '../src/data/schemas.js';
import {
  applyStatus,
  hasMark,
  hitMonster,
  isBurning,
  isChilled,
  isFrozen,
  isHexed,
  isPoisoned,
  isRattled,
  isShocked,
  makeCtx,
} from '../src/arpg/combat.js';
import { shieldHero } from '../src/arpg/abilities/defend.js';
import { createSandboxWorld, spawnDummies } from '../src/arpg/sandbox.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, MonsterEntity } from '../src/types/arpg.js';
import { MANA_TYPES, type ManaType } from '../src/types/mana.js';
import {
  DEFAULT_BUILDS,
  arena,
  bal,
  dummy,
  press,
  registry,
  run,
  type ArenaOpts,
} from './fixtures/arena.js';

// See the elemental stacks spec. The fixture arena's hero stands at (13, 36); `dummy(x, y)` is
// a sturdy Fire foe (it resists fire) that doesn't fight back.

/** Sturdy foes (one at (13, 20) by default), the hero's basic attack stopped; `m` is the first. */
function setup(monsters: Partial<MonsterEntity>[] = [dummy(13, 20)], opts: ArenaOpts = {}) {
  const w = arena(monsters, { noBasic: true, ...opts });
  const events: ArpgEvent[] = [];
  return { w, events, ctx: makeCtx(registry, w, events), m: w.monsters[0] };
}

describe('balance: delve.stacks', () => {
  it('loads the stack numbers', () => {
    expect(bal.stacks).toEqual({
      cap: 5,
      duration: { fire: 3, frost: 3, storm: 4, earth: 2, shadow: 6, nature: 4 },
      byWeight: [1, 1, 2, 3, 3],
      basicBlow: 1,
      basicFinisher: 2,
      tick: 1,
      curve: [1, 1.8, 2.45, 3, 3.5],
      freezeAt: 3,
      firePerStack: 0.35,
      frostSlowPerStack: 0.2,
      frostSlowCap: 0.6,
      shockPerStack: 0.08,
      hexPerStack: 0.06,
      poisonPerStack: 1.7,
      reactionLockout: 1,
    });
  });

  it('refuses a cap under 1, a weight list not five long, a one-step curve and a slow cap over 1', () => {
    const parses = (stacks: object) =>
      BalanceConfigSchema.safeParse({
        ...balanceData,
        delve: { ...balanceData.delve, stacks: { ...balanceData.delve.stacks, ...stacks } },
      }).success;
    expect(parses({})).toBe(true);
    expect(parses({ cap: 0 })).toBe(false);
    expect(parses({ byWeight: [1, 2, 3] })).toBe(false);
    expect(parses({ curve: [1] })).toBe(false);
    expect(parses({ frostSlowCap: 1.5 })).toBe(false);
  });

  it('the status keys the stacks replace are gone', () => {
    expect(Object.keys(bal.status)).toEqual([
      'burnDps',
      'freezeDuration',
      'staggerDuration',
      'blindMiss',
      'blindDuration',
      'poisonDps',
      'rootDuration',
      'rootBossMult',
      'staggerImmunity',
      'freezeImmunity',
      'rootImmunity',
    ]);
  });
});

describe('stacks', () => {
  it("a status adds its element's stacks, to the cap; a stagger adds Earth's only from an Earth source", () => {
    const { ctx, m } = setup();
    applyStatus(ctx, m, 'burn', 100);
    expect(m.status.stacks.fire).toBe(bal.stacks.tick);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    expect(m.status.stacks.fire).toBe(bal.stacks.tick + 3);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    expect(m.status.stacks.fire).toBe(bal.stacks.cap);
    applyStatus(ctx, m, 'stagger', 0);
    expect(m.status.stacks.earth).toBe(0);
    applyStatus(ctx, m, 'stagger', 0, true);
    expect(m.status.stacks.earth).toBe(bal.stacks.tick);
  });

  it('a new stack starts its timer again; at the timer all its stacks lapse together, on a dummy too', () => {
    const { w, ctx, m, events } = setup();
    const d = bal.stacks.duration.storm;
    applyStatus(ctx, m, 'shock', 0, false, undefined, 2);
    run(w, d - 1);
    applyStatus(ctx, m, 'shock', 0, false, undefined, 1);
    expect(m.status.stackUntil.storm).toBeCloseTo(w.t + d);
    run(w, d - 0.2);
    expect(m.status.stacks.storm).toBe(3);
    run(w, 0.4);
    expect(m.status.stacks.storm).toBe(0);
    // A lapsed count can't pair: Frost finds no Storm for Superconduct.
    hitMonster(ctx, m, 10, 'frost', { source: 'skill' });
    expect(events.some((e) => e.kind === 'reaction')).toBe(false);

    const sandbox = createSandboxWorld(registry, {
      depth: 3,
      stats: computeHeroStats({}, registry),
      abilities: DEFAULT_BUILDS,
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
    const [target] = spawnDummies(registry, sandbox, { layout: 'single', element: null });
    applyStatus(makeCtx(registry, sandbox, []), target, 'hex', 0);
    run(sandbox, bal.stacks.duration.shadow + 0.1);
    expect(target.status.stacks.shadow).toBe(0);
  });

  it('a hit applies `stacks` of each element status it carries (stacks.tick when it names none)', () => {
    const { ctx, m } = setup();
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', applies: ['burn', 'poison'], stacks: 3 });
    expect(m.status.stacks).toMatchObject({ fire: 3, nature: 3 });
    hitMonster(ctx, m, 10, null, { source: 'skill', applies: ['shock'] });
    expect(m.status.stacks.storm).toBe(bal.stacks.tick);
  });

  it("each predicate reads its element's count, and a bare freeze is a frost mark", () => {
    const { w, ctx, m } = setup();
    const on = () =>
      [isBurning, isChilled, isShocked, isRattled, isHexed, isPoisoned].map((is) => is(ctx, m));
    expect(on()).toEqual([false, false, false, false, false, false]);
    for (const e of MANA_TYPES) m.status.stacks[e] = 1;
    expect(on()).toEqual([true, true, true, true, true, true]);
    for (const e of MANA_TYPES) m.status.stacks[e] = 0;
    m.status.freezeUntil = w.t + 1;
    expect(MANA_TYPES.filter((e) => hasMark(ctx, m, e))).toEqual(['frost']);
    expect(isChilled(ctx, m)).toBe(false);
  });
});

describe('what the count does', () => {
  it('a burn deals its ref × firePerStack × the curve a second, every 0.5 s, and stops at 0', () => {
    const { w, ctx, m } = setup([dummy(13, 20, { element: 'shadow' })]); // Shadow: neutral to fire
    applyStatus(ctx, m, 'burn', 100, false, undefined, 3);
    const hp = m.hp;
    const ticks = run(w, 1.1).filter((e) => e.kind === 'hit' && e.source === 'dot');
    expect(ticks).toHaveLength(2);
    expect(hp - m.hp).toBeCloseTo(
      100 * bal.status.burnDps * bal.stacks.firePerStack * bal.stacks.curve[2],
    );
    m.status.stacks.fire = 0;
    expect(run(w, 1).some((e) => e.kind === 'hit')).toBe(false);
  });

  it('frost slows by frostSlowPerStack a stack, up to frostSlowCap', () => {
    const walked = (frost: number) => {
      const w = arena([{ x: 13, y: 20, hp: 1e6, maxHp: 1e6, aggro: true }], { noBasic: true });
      const m = w.monsters[0];
      m.status.stacks.frost = frost;
      m.status.stackUntil.frost = 1e9;
      const y = m.y;
      run(w, 0.5);
      return m.y - y;
    };
    const free = walked(0);
    expect(free).toBeGreaterThan(0);
    expect(walked(1) / free).toBeCloseTo(1 - bal.stacks.frostSlowPerStack);
    expect(walked(2) / free).toBeCloseTo(1 - 2 * bal.stacks.frostSlowPerStack);
    expect(walked(5) / free).toBeCloseTo(1 - bal.stacks.frostSlowCap);
  });

  it("shock and hex make every hit on the foe deal more along the curve; Tempest doubles shock's", () => {
    const dealt = (stacks: Partial<Record<ManaType, number>>, tempest = false) => {
      const { w, ctx, m } = setup();
      if (tempest) w.hero.stats.attunement.storm = bal.mana.masteryThreshold;
      Object.assign(m.status.stacks, stacks);
      return hitMonster(ctx, m, 100, null, { source: 'skill' });
    };
    const plain = dealt({});
    const [c3, c5] = [bal.stacks.curve[2], bal.stacks.curve[4]];
    expect(dealt({ storm: 3 }) / plain).toBeCloseTo(1 + bal.stacks.shockPerStack * c3);
    expect(dealt({ storm: 3 }, true) / plain).toBeCloseTo(1 + 2 * bal.stacks.shockPerStack * c3);
    expect(dealt({ shadow: 5 }) / plain).toBeCloseTo(1 + bal.stacks.hexPerStack * c5);
  });

  it('poison follows the curve, and past its end each stack adds its last step', () => {
    const dealt = (n: number) => {
      const { w, ctx, m } = setup([dummy(13, 20, { element: 'shadow' })]); // neutral to nature
      w.hero.stats.attunement.nature = bal.mana.masteryThreshold; // Plaguebearer: room for 10
      applyStatus(ctx, m, 'poison', 100, false, undefined, n);
      const hp = m.hp;
      run(w, 1.1); // two ticks: a second of poison
      return hp - m.hp;
    };
    const one = 100 * bal.status.poisonDps * bal.stacks.poisonPerStack;
    const c = bal.stacks.curve;
    expect(dealt(1)).toBeCloseTo(one);
    expect(dealt(3)).toBeCloseTo(one * c[2]);
    // Seven stacks: the curve's five, then two steps of its last one (3.5 → 4.5).
    expect(dealt(7)).toBeCloseTo(one * (c[4] + 2 * (c[4] - c[3])));
  });
});

describe('freeze', () => {
  it('frost crossing freezeAt freezes, with immunity after; the stacks stay', () => {
    const { ctx, m, events } = setup();
    applyStatus(ctx, m, 'chill', 0, false, undefined, bal.stacks.freezeAt - 1);
    expect(isFrozen(ctx, m)).toBe(false);
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(true);
    expect(m.status.stacks.frost).toBe(bal.stacks.freezeAt);
    expect(m.status.freezeImmuneUntil).toBeCloseTo(
      m.status.freezeUntil + bal.status.freezeImmunity,
    );
    expect(events.filter((e) => e.kind === 'freeze')).toHaveLength(1);
  });

  it("a foe held at freezeAt or more doesn't freeze again; dropping under it and climbing back does", () => {
    const { ctx, m } = setup();
    applyStatus(ctx, m, 'chill', 0, false, undefined, bal.stacks.freezeAt);
    // The freeze and its immunity run out while the stacks stay.
    m.status.freezeUntil = m.status.freezeImmuneUntil = 0;
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(false);
    m.status.stacks.frost = bal.stacks.freezeAt - 1; // a pair came off
    applyStatus(ctx, m, 'chill', 0, false, undefined, 1);
    expect(isFrozen(ctx, m)).toBe(true);
  });

  it("Glacier's first hit freezes: its freeze raises frost to freezeAt, and the hit checks once", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { elements: ['frost', 'earth'] } });
    const events = [...press(w, 0), ...run(w, 1)];
    const m = w.monsters[0];
    expect(events.filter((e) => e.kind === 'freeze')).toHaveLength(1);
    expect(isFrozen(makeCtx(registry, w, []), m)).toBe(true);
    expect(m.status.stacks.frost).toBe(bal.stacks.freezeAt);
  });

  it("a Frost Ward's retaliation freezes an attacker whose chills cross freezeAt", () => {
    const { w, ctx, m } = setup([dummy(13, 35)]); // the fixture's Defensive is a Frost Ward
    w.hero.defend = { form: 'ward', until: 1e9 };
    m.status.stacks.frost = bal.stacks.freezeAt - 1;
    shieldHero(ctx, 10, m, true);
    expect(isFrozen(ctx, m)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts)`
Expected: 13 FAIL, the two balance tests from Task 1 PASS. Eight fail with a TypeError on the missing `status.stacks` ("Cannot read properties of undefined (reading 'fire')", "Cannot set properties of undefined (setting 'frost')" and the like); "a hit applies `stacks`…" with "expected undefined to match object { fire: 3, nature: 3 }"; "the status keys the stacks replace are gone" with "expected [ 'burnDps', 'burnDuration', …(20) ] to deeply equal [ 'burnDps', 'freezeDuration', …(9) ]"; the burn test with "expected 35 to be close to 30.012500000000003" (today's burn, 0.35 of the hit, against 0.35 × 0.35 × the curve's 2.45); the poison test with "expected 12 to be close to 20.4"; "a foe held at freezeAt…" with "expected true to be false".

- [ ] **Step 3: The state, the numbers and the schema**

In `src/types/arpg.ts`, `StatusState`: its fields from `  burnDps: number;` through `  rootUntil: number;` (lines 133–157; the immunity fields after them stay) become

```ts
  /** Elemental stacks per element (0 to the cap): the count is the status and its strength. */
  stacks: Record<ManaType, number>;
  /** When each element's stacks lapse, all together; a new stack of it pushes this back. */
  stackUntil: Record<ManaType, number>;
  /** The strongest applying hit × `status.burnDps`: a burn deals `firePerStack` × `curve` of it a second. */
  burnRef: number;
  burnTickAt: number;
  /** The ability slot whose burn set `burnRef` (undefined: a basic's, or no slot's); its ticks carry it. */
  burnSlot: number | undefined;
  freezeUntil: number;
  staggerUntil: number;
  /** Sunder: every hit on the foe deals more until this time. */
  sunderUntil: number;
  blindUntil: number;
  brandUntil: number;
  /** The strongest applying hit × `status.poisonDps`: poison deals `poisonPerStack` × `curve` of it a second. */
  poisonRef: number;
  poisonTickAt: number;
  /** The ability slot whose poison set `poisonRef` (see `burnSlot`). */
  poisonSlot: number | undefined;
  rootUntil: number;
```

In `src/arpg/world.ts`, `emptyStatus()`: the lines from `  return {` through `    rootUntil: 0,` (lines 40–60) become

```ts
  const none = () => ({ fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0, nature: 0 });
  return {
    stacks: none(),
    stackUntil: none(),
    burnRef: 0,
    burnTickAt: 0,
    burnSlot: undefined,
    freezeUntil: 0,
    staggerUntil: 0,
    sunderUntil: 0,
    blindUntil: 0,
    brandUntil: 0,
    poisonRef: 0,
    poisonTickAt: 0,
    poisonSlot: undefined,
    rootUntil: 0,
```

In `src/types/delve.ts`, the `status` block's lines from `    /** Burn deals this fraction of the igniting hit per second. */` through `    poisonMaxStacks: number;` (lines 412–432; `rootDuration` and the rest after them stay) become

```ts
    /** A burn's ref: this fraction of the igniting hit (see `stacks.firePerStack`). */
    burnDps: number;
    freezeDuration: number;
    staggerDuration: number;
    blindMiss: number;
    blindDuration: number;
    /** A poison's ref: this fraction of the applying hit (see `stacks.poisonPerStack`). */
    poisonDps: number;
```

and in its `reactions` block, the Crystallize line

```ts
    /** Crystallize: the hit × this, and one chill stack on foes within `crystallizeRadius`. */
```

becomes

```ts
    /** Crystallize: the hit × this, and `stacks.tick` frost stacks on foes within `crystallizeRadius`. */
```

In `src/data/schemas.ts`, the `status` object's lines from `    burnDps: z.number().min(0),` through `    poisonMaxStacks: z.number().int().positive(),` (lines 789–805) become

```ts
    burnDps: z.number().min(0),
    freezeDuration: z.number().positive(),
    staggerDuration: z.number().positive(),
    blindMiss: z.number().min(0).max(1),
    blindDuration: z.number().positive(),
    poisonDps: z.number().min(0),
```

In `src/data/balance.json` (hand-edit), the `delve.status` block

```json
    "status": {
      "burnDps": 0.35, "burnDuration": 3, "chillSlow": 0.4, "chillDuration": 3, "chillToFreeze": 2, "freezeDuration": 1.6,
      "shockBonus": 0.2, "shockDuration": 4, "hexBonus": 0.15, "hexDuration": 6, "staggerDuration": 0.6, "rattleDuration": 2,
      "blindMiss": 0.5, "blindDuration": 4,
      "poisonDps": 0.12, "poisonDuration": 4, "poisonMaxStacks": 5, "rootDuration": 1.5, "rootBossMult": 0.4,
      "staggerImmunity": 1.2, "freezeImmunity": 1.5, "rootImmunity": 2
    },
```

becomes

```json
    "status": {
      "burnDps": 0.35, "freezeDuration": 1.6, "staggerDuration": 0.6, "blindMiss": 0.5, "blindDuration": 4,
      "poisonDps": 0.12, "rootDuration": 1.5, "rootBossMult": 0.4,
      "staggerImmunity": 1.2, "freezeImmunity": 1.5, "rootImmunity": 2
    },
```

- [ ] **Step 4: The combat code**

In `src/arpg/combat.ts`:

1. Everything from `HitOpts`' last field (line 56, `  /** The source includes Earth: a stagger it applies rattles the foe (Earth's mark). */`) through the closing `}` of `spreadAffliction` (line 147): the rest of `HitOpts`, `KILL_SCRAP_MULT`, the predicates, `hasMark`, `poisonCap`, `poison` and `spreadAffliction`, becomes

```ts
  /** The source includes Earth: its stagger adds Earth stacks. */
  rattles?: boolean;
  /**
   * Stacks the hit applies of each element status in `applies` (default `stacks.tick`; see
   * the elemental stacks spec).
   */
  stacks?: number;
}

const KILL_SCRAP_MULT = { normal: 1, elite: 3, boss: 10 } as const;

/** The status each element's hits apply: its stacks (Earth's `stagger` only from an Earth source). */
export const BASIC_STATUS: Record<ManaType, StatusId> = {
  fire: 'burn',
  frost: 'chill',
  storm: 'shock',
  earth: 'stagger',
  shadow: 'hex',
  nature: 'poison',
};
/** BASIC_STATUS's inverse: the element whose stacks a status adds. */
const STATUS_ELEMENT: Partial<Record<StatusId, ManaType>> = Object.fromEntries(
  MANA_TYPES.map((e) => [BASIC_STATUS[e], e]),
);

export function isBurning(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.fire > 0;
}
export function isChilled(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.frost > 0;
}
export function isFrozen(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.freezeUntil;
}
export function isShocked(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.storm > 0;
}
export function isHexed(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.shadow > 0;
}
export function isStunned(ctx: SimCtx, m: MonsterEntity): boolean {
  return isFrozen(ctx, m) || ctx.world.t < m.status.staggerUntil;
}
export function isPoisoned(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.nature > 0;
}
export function isRooted(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.rootUntil;
}
export function isRattled(_ctx: SimCtx, m: MonsterEntity): boolean {
  return m.status.stacks.earth > 0;
}
export function isSundered(ctx: SimCtx, m: MonsterEntity): boolean {
  return ctx.world.t < m.status.sunderUntil;
}

/** Whether `m` has stacks of `element`; for frost, a bare freeze counts too. */
export function hasMark(ctx: SimCtx, m: MonsterEntity, element: ManaType): boolean {
  return m.status.stacks[element] > 0 || (element === 'frost' && isFrozen(ctx, m));
}

/** Most stacks of `element` a foe holds (Nature's doubled by its mastery). */
function stackCap(ctx: SimCtx, element: ManaType): number {
  return ctx.bal.stacks.cap * (element === 'nature' && mastery(ctx, 'nature') ? 2 : 1);
}

/**
 * How strong `n` stacks of a status are, in per-stack units: `stacks.curve[n - 1]`, each stack
 * past the curve's end adding its last step (Plaguebearer's poison).
 */
export function stackIntensity(ctx: SimCtx, n: number): number {
  const c = ctx.bal.stacks.curve;
  if (n <= 0) return 0;
  if (n <= c.length) return c[n - 1];
  const last = c[c.length - 1];
  return last + (n - c.length) * (last - c[c.length - 2]);
}

/**
 * `n` more stacks of `element` on `m` (to the cap), starting the element's timer again. A
 * burn's or poison's `ref` (damage per stack) and `slot` take over when the element had no
 * stacks, or when `ref` is at least the current one. A spread onto a foe that already has as
 * many passes `n` ≤ 0: it adds none, but the timer and the ref still refresh.
 */
function applyStacks(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
  n: number,
  ref: number,
  slot: number | undefined,
): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = s.stacks[element] > 0;
  if (!active && n <= 0) return;
  s.stacks[element] = Math.min(stackCap(ctx, element), s.stacks[element] + Math.max(0, n));
  s.stackUntil[element] = t + ctx.bal.stacks.duration[element];
  if (element === 'fire') {
    if (!active) s.burnTickAt = t + 0.5;
    if (!active || ref >= s.burnRef) {
      s.burnRef = ref;
      s.burnSlot = slot;
    }
  } else if (element === 'nature') {
    if (!active) s.poisonTickAt = t + 0.5;
    if (!active || ref >= s.poisonRef) {
      s.poisonRef = ref;
      s.poisonSlot = slot;
    }
  }
}

/** A spread: `o` takes at least `m`'s stacks of `element`, with its burn's or poison's ref and slot. */
function spreadStacks(ctx: SimCtx, m: MonsterEntity, o: MonsterEntity, element: ManaType): void {
  const s = m.status;
  if (s.stacks[element] <= 0) return;
  const [ref, slot] =
    element === 'fire'
      ? [s.burnRef, s.burnSlot]
      : element === 'nature'
        ? [s.poisonRef, s.poisonSlot]
        : [0, undefined];
  applyStacks(ctx, o, element, s.stacks[element] - o.status.stacks[element], ref, slot);
}

/** Plague's and Blight's spread: the foe's nature and shadow stacks pass to its neighbours. */
function spreadAffliction(ctx: SimCtx, m: MonsterEntity): void {
  for (const o of nearby(ctx, m, ctx.bal.reactions.blightRadius)) {
    spreadStacks(ctx, m, o, 'nature');
    spreadStacks(ctx, m, o, 'shadow');
  }
}
```

(The predicates keep their `ctx` parameter for their callers; `_ctx` marks it unused, as `_registry` does in `delve/dive.ts`.)

2. `applyStatus`: from its doc comment (line 176, the `/**` above "Apply `status`; with `rattles` (an Earth source) a stagger also rattles the foe.") through `    case 'root':` (line 234): its comment, its signature, its `case 'burn'`, `'chill'`, `'freeze'`, `'shock'`, `'hex'`, `'stagger'` and `'poison'`, becomes

```ts
/**
 * Apply `status` outside a hit (a hit's own go through `hitMonster`): `n` stacks of its
 * element (a stagger's Earth stacks only with `rattles`, an Earth source), and frost crossing
 * `stacks.freezeAt` freezes. `slot`: the ability applying it; a burn's or poison's ticks carry
 * it when it sets their damage.
 */
export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles = false,
  slot?: number,
  n = ctx.bal.stacks.tick,
): void {
  const frost = m.status.stacks.frost;
  addStatus(ctx, m, status, hitAmount, rattles, slot, n);
  crossFreeze(ctx, m, frost);
}

/** Frost's count crossing `stacks.freezeAt` since `before` freezes the foe (immunity may refuse). */
function crossFreeze(ctx: SimCtx, m: MonsterEntity, before: number): void {
  const at = ctx.bal.stacks.freezeAt;
  if (before < at && m.status.stacks.frost >= at) freeze(ctx, m, ctx.bal.status.freezeDuration);
}

/** `applyStatus` without the freeze check: a hit checks once, after all of its statuses. */
function addStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles: boolean | undefined,
  slot: number | undefined,
  n: number,
): void {
  const st = ctx.bal.status;
  const t = ctx.world.t;
  const boss = m.kind === 'boss';
  const ccScale = boss ? 0.4 : 1;
  const s = m.status;
  const element = STATUS_ELEMENT[status];
  // The element's stacks; a stagger's Earth stacks only from an Earth source (immunity doesn't refuse them).
  if (element && (status !== 'stagger' || rattles)) {
    const perStack = element === 'fire' ? st.burnDps : element === 'nature' ? st.poisonDps : 0;
    applyStacks(ctx, m, element, n, hitAmount * perStack, slot);
  }
  switch (status) {
    case 'freeze':
      // Glacier: frost up to the threshold, so the hit crosses it.
      applyStacks(ctx, m, 'frost', ctx.bal.stacks.freezeAt - s.stacks.frost, 0, slot);
      break;
    case 'stagger':
      if (t < s.staggerImmuneUntil) break;
      s.staggerUntil = Math.max(s.staggerUntil, t + st.staggerDuration * ccScale);
      s.staggerImmuneUntil = s.staggerUntil + st.staggerImmunity;
      m.windupUntil = 0;
      break;
    case 'root':
```

(The `'root'`, `'blind'` and `'brand'` cases below it stay as they are.)

3. `useUpMark`, with its comment (lines 292–324), becomes this interim (Task 4 replaces it):

```ts
/**
 * Clear the mark that set `reaction` off: its element's stacks. Earth's Shatter
 * breaks only the freeze; Storm's Superconduct takes only the stacks (the freeze
 * it would add again is refused by immunity, so the foe stays frozen).
 */
function useUpMark(m: MonsterEntity, mark: ManaType, reaction: ReactionId): void {
  if (mark !== 'frost' || reaction !== 'shatter') m.status.stacks[mark] = 0;
  if (mark === 'frost' && reaction !== 'superconduct') m.status.freezeUntil = 0;
}
```

4. `hitMonster`: the two lines

```ts
  if (isShocked(ctx, m)) amount *= 1 + bal.status.shockBonus * (mastery(ctx, 'storm') ? 2 : 1);
  if (isHexed(ctx, m)) amount *= 1 + bal.status.hexBonus;
```

become

```ts
  const stacks = m.status.stacks;
  const tempest = mastery(ctx, 'storm') ? 2 : 1;
  amount *= 1 + bal.stacks.shockPerStack * stackIntensity(ctx, stacks.storm) * tempest;
  amount *= 1 + bal.stacks.hexPerStack * stackIntensity(ctx, stacks.shadow);
```

and after `  // Elemental reactions: this hit's element meets another element's mark on the foe.` add `  const frostBefore = stacks.frost;`.

5. `hitMonster`: the two lines

```ts
  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount, opts.rattles, opts.slot);
  if (riposte) applyStatus(ctx, m, 'stagger', amount);
```

become

```ts
  const k = opts.stacks ?? bal.stacks.tick;
  for (const s of opts.applies ?? []) addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k);
  // The riposte staggers; it adds no stacks.
  if (riposte) addStatus(ctx, m, 'stagger', amount, false, undefined, 0);
  // Frost freezes only if the hit's final count crossed the threshold.
  crossFreeze(ctx, m, frostBefore);
```

6. `killMonster`: `  if (t < m.status.hexUntil && mastery(ctx, 'shadow')) healHero(ctx, h.stats.maxHp * 0.04, 'kill');` becomes `  if (isHexed(ctx, m) && mastery(ctx, 'shadow')) healHero(ctx, h.stats.maxHp * 0.04, 'kill');`, and the Fire mastery block

```ts
  // Fire mastery: flames spread from burning corpses.
  if (t < m.status.burnUntil && mastery(ctx, 'fire')) {
    for (const o of world.monsters) {
      if (o.dead || dist(o.x, o.y, m.x, m.y) > 2.5) continue;
      if (t >= o.status.burnUntil || m.status.burnDps >= o.status.burnDps)
        o.status.burnSlot = m.status.burnSlot;
      o.status.burnDps = Math.max(o.status.burnDps, m.status.burnDps);
      if (t >= o.status.burnUntil) o.status.burnTickAt = t + 0.5;
      o.status.burnUntil = t + bal.status.burnDuration;
    }
  }
```

becomes

```ts
  // Fire mastery: flames spread from burning corpses.
  if (isBurning(ctx, m) && mastery(ctx, 'fire')) {
    for (const o of world.monsters)
      if (!o.dead && dist(o.x, o.y, m.x, m.y) <= 2.5) spreadStacks(ctx, m, o, 'fire');
  }
```

- [ ] **Step 5: The tick, the basic attack's import, the export**

In `src/arpg/step.ts`:
- in the import from `'./combat.js'` (lines 10–19), delete the line `  isChilled,` and add `  stackIntensity,` after `  makeCtx,`; above that import add `import { MANA_TYPES } from '../types/mana.js';`;
- in `monstersTick`, the lines from `    const s = m.status;` through the poison tick's `      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', {`

```ts
    const s = m.status;

    if (world.t < s.burnUntil && world.t >= s.burnTickAt) {
      s.burnTickAt += 0.5;
      hitMonster(ctx, m, s.burnDps * 0.5, 'fire', {
        source: 'dot',
        noReact: true,
        slot: s.burnSlot,
      });
      if (m.dead) continue;
    }
    if (world.t < s.poisonUntil && world.t >= s.poisonTickAt) {
      s.poisonTickAt += 0.5;
      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', {
```

become

```ts
    const s = m.status;
    // An element's stacks lapse together at its timer (a dummy's too).
    for (const e of MANA_TYPES) if (world.t >= s.stackUntil[e]) s.stacks[e] = 0;

    if (s.stacks.fire > 0 && world.t >= s.burnTickAt) {
      s.burnTickAt += 0.5;
      const perSecond = s.burnRef * bal.stacks.firePerStack * stackIntensity(ctx, s.stacks.fire);
      hitMonster(ctx, m, perSecond * 0.5, 'fire', {
        source: 'dot',
        noReact: true,
        slot: s.burnSlot,
      });
      if (m.dead) continue;
    }
    if (s.stacks.nature > 0 && world.t >= s.poisonTickAt) {
      s.poisonTickAt += 0.5;
      const perSecond =
        s.poisonRef * bal.stacks.poisonPerStack * stackIntensity(ctx, s.stacks.nature);
      hitMonster(ctx, m, perSecond * 0.5, 'nature', {
```

- and the two lines

```ts
    const slow = isChilled(ctx, m) ? 1 - bal.status.chillSlow : 1;
    const speed = m.speed * slow;
```

become

```ts
    const chill = Math.min(bal.stacks.frostSlowCap, s.stacks.frost * bal.stacks.frostSlowPerStack);
    const speed = m.speed * (1 - chill);
```

In `src/arpg/basic.ts`: `import { hitMonster, type SimCtx } from './combat.js';` becomes `import { BASIC_STATUS, hitMonster, type SimCtx } from './combat.js';`, and delete the `BASIC_STATUS` constant with its comment (lines 16–24, `/** The status each element's basic blows may apply (a finisher's discharge always applies it). */` through its closing `};`), keeping `const BASIC_STATUS_CHANCE = 0.3;` below it (Task 3 removes the roll).

In `src/index.ts`: `export { basicStep, BASIC_STATUS } from './arpg/basic.js';` becomes `export { basicStep } from './arpg/basic.js';`, and `export { makeCtx } from './arpg/combat.js';` becomes `export { makeCtx, BASIC_STATUS } from './arpg/combat.js';`.

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts && npx tsc --noEmit -p .)`
Expected: 15 PASS; no type errors.

- [ ] **Step 6: The existing tests read counts**

Each of these read a field this task removed:

`tests/ability-forms.test.ts` (Plague): `    expect(w.monsters[0].status.hexUntil).toBeGreaterThan(w.t);` becomes `    expect(w.monsters[0].status.stacks.shadow).toBe(1);` (the corpse's one stack, spread).

`tests/ability-status.test.ts`:
- `    expect(m.status.poisonStacks).toBe(bal.status.poisonMaxStacks);` → `    expect(m.status.stacks.nature).toBe(bal.stacks.cap);`
- `    expect(before - m.hp).toBeCloseTo(100 * bal.status.poisonDps * bal.status.poisonMaxStacks, 0);` becomes

```ts
    const atCap = bal.stacks.curve[bal.stacks.cap - 1];
    expect(before - m.hp).toBeCloseTo(
      100 * bal.status.poisonDps * bal.stacks.poisonPerStack * atCap,
      0,
    );
```

- `    run(w, bal.status.poisonDuration + 0.6);` → `    run(w, bal.stacks.duration.nature + 0.6);`
- `    expect(w.monsters[0].status.poisonStacks).toBe(bal.status.poisonMaxStacks * 2);` → `    expect(w.monsters[0].status.stacks.nature).toBe(bal.stacks.cap * 2);`
- `    expect(a.status.poisonStacks).toBe(0);` → `    expect(a.status.stacks.nature).toBe(0);`
- `    expect(b.status.poisonStacks).toBe(3);` → `    expect(b.status.stacks.nature).toBe(3);`
- `    expect(far.status.poisonStacks).toBe(0);` → `    expect(far.status.stacks.nature).toBe(0);`

`tests/arpg-sim.test.ts`: `    expect(w.monsters[0].status.burnUntil).toBeGreaterThan(0);` → `    expect(w.monsters[0].status.stacks.fire).toBeGreaterThan(0);`, and `    expect(m.status.chillUntil).toBe(0);` → `    expect(m.status.stacks.frost).toBe(0);`.

`tests/delve-infusion.test.ts` ("monster slams, Overload, Combust and Hellfire Brand carry null"): `    a.status.burnUntil = w.t + 5;` → `    a.status.stacks.fire = 1;`, and the two lines `    b.status.poisonUntil = w.t + 5;` and `    b.status.poisonStacks = 2;` become the one line `    b.status.stacks.nature = 2;`.

`tests/delve-pair.test.ts`:
- in "blows strike with the primary; the finisher with the secondary, always applying its status", `      expect(f.monsters[0].status.shockUntil).toBeGreaterThan(f.t);` → `      expect(f.monsters[0].status.stacks.storm).toBeGreaterThan(0);` and `      expect(f.monsters[0].status.burnUntil).toBe(0);` → `      expect(f.monsters[0].status.stacks.fire).toBe(0);`;
- in "fire blows, then a storm finisher on a burning foe: Overload", `    w.monsters[0].status.burnUntil = 1e9;` becomes

```ts
    const s = w.monsters[0].status;
    s.stacks.fire = 1;
    s.stackUntil.fire = 1e9;
```

(the timer too: the world steps before the finisher lands, and a count whose timer passed lapses).

`tests/delve-training.test.ts`: `    expect(d.status.burnUntil).toBeGreaterThan(w.t);` → `    expect(d.status.stacks.fire).toBeGreaterThan(0);`, and in "resetDummies puts them home…" the two lines `    d.status.burnUntil = w.t + 3;` and `    d.status.chillStacks = 1;` become `    d.status.stacks.fire = 2;` and `    d.status.stacks.frost = 1;`.

`tests/delve-reactions.test.ts`:
- the import from `'../src/arpg/combat.js'`: after `  makeCtx,` add `  BASIC_STATUS,`; delete the line `import { BASIC_STATUS } from '../src/arpg/basic.js';`;
- `EFFECTS.blight`: `    else expect(f.o.status.poisonUntil).toBe(0);` → `    else expect(f.o.status.stacks.nature).toBe(0);`;
- `EFFECTS.crystallize`: `    expect(f.o.status.chillStacks).toBe(1);` → `    expect(f.o.status.stacks.frost).toBe(bal.stacks.tick);`;
- "balance: the reactions": the title `"loads the new eight's numbers, their cooldown and Earth's rattle"` → `"loads the new eight's numbers, their cooldown and how long Earth's stacks last"`, and `    expect(bal.status.rattleDuration).toBe(2);` → `    expect(bal.stacks.duration.earth).toBe(2);`;
- "marks": the title `'an Earth stagger rattles, even when immunity refuses the stagger; it lapses after rattleDuration'` → `'an Earth stagger rattles, even when immunity refuses the stagger; it lapses with Earth stacks'`; `    expect(m.status.rattledUntil).toBeCloseTo(w.t + bal.status.rattleDuration);` becomes

```ts
    expect(m.status.stacks.earth).toBe(bal.stacks.tick);
    expect(m.status.stackUntil.earth).toBeCloseTo(w.t + bal.stacks.duration.earth);
```

and `    run(w, bal.status.rattleDuration + 0.1);` → `    run(w, bal.stacks.duration.earth + 0.1);`;
- "every pair reacts, both ways" (the Superconduct branch): `      expect(m.status.chillStacks).toBe(0);` → `      expect(m.status.stacks.frost).toBe(0);`;
- "Sunder": `    // The sundering hit gets the hex it used up, not Sunder.` → `    // The sundering hit gets the hex stack it used up, not Sunder.`, and the line `      hitMonster(plain.ctx, plain.m, 100, 'earth', { source: 'skill' }) * (1 + bal.status.hexBonus),` becomes

```ts
      hitMonster(plain.ctx, plain.m, 100, 'earth', { source: 'skill' }) *
        (1 + bal.stacks.hexPerStack),
```

- [ ] **Step 7: Run to verify**

Run: `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts && npx tsc --noEmit -p .)`
Expected: 72 files, 1161 tests, all green; no type errors. (The pacing file is left out: see Conventions.)

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/basic.ts packages/engine/src/index.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/ability-status.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-training.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/types/delve.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/basic.ts packages/engine/src/index.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/ability-forms.test.ts packages/engine/tests/ability-status.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-training.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): elemental stacks replace the status timers" -m "Pacing rails (tests/delve-pacing.test.ts) not run: the stacks model is whole only after Task 5 (they pass on the scratch copy)." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 3: Engine: every hit's count

### Task 3: Every hit carries its count

The spec's table of counts: a blow `basicBlow`, a finisher (and its discharge) `basicFinisher`, an ability's direct hit `byWeight` (on `ResolvedAbility`, as the other weight numbers are), everything else `tick` by default. The 30% roll (18% for Earth) goes, which removes one `rng.next()` per blow; Twin Fang's extra hit applies nothing. `Zone.applies`, written and never read, goes too.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`Projectile.stacks` after `rattles`; `Zone.applies`)
- Modify: `packages/engine/src/types/ability.ts:117` (CRLF: hand-edit, never format)
- Modify: `packages/engine/src/arpg/abilities/resolve.ts:117` (CRLF: hand-edit, never format)
- Modify: `packages/engine/src/arpg/abilities/impact.ts:21-49` (`hitOpts`), `:108` (`leaveZone`)
- Modify: `packages/engine/src/arpg/abilities/forms.ts:148`, `:251`, `:275`
- Modify: `packages/engine/src/arpg/basic.ts` (after Task 2: `:16`, `:126-137`, `:157-167`, `:188-198`, `:246`)
- Modify: `packages/engine/src/arpg/step.ts` (after Task 2: `:265`, the basic shot; `:371`, the boss slam)
- Modify: `packages/engine/tests/delve-stacks.test.ts` (imports; a new `describe`)
- Modify: `packages/engine/tests/{delve-reactions,delve-combat-weight,arpg-sim,delve-dodge,delve-infusion,delve-training}.test.ts` (Step 6)

- [ ] **Step 1: Write the failing tests**

In `tests/delve-stacks.test.ts`, the imports: after `import { shieldHero } from '../src/arpg/abilities/defend.js';` add `import { resolveAbility } from '../src/arpg/abilities/resolve.js';`; after `import { computeHeroStats } from '../src/delve/hero-stats.js';` add

```ts
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { ABILITY_WEIGHTS } from '../src/types/ability.js';
```

and in the fixtures import add `  firstBlow,` and `  gear,` after `  dummy,`, and `  strikeWorld,` after `  run,`.

Append to the end of the file:

```ts

describe('stacks per hit', () => {
  const sword = { weapon: gear('fire') };

  it('every blow applies basicBlow stacks, whatever the seed: no roll', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const w = strikeWorld(sword, {});
      w.rng = new SeededRNG(seed);
      firstBlow(w);
      firstBlow(w);
      expect(w.monsters[0].status.stacks.fire, `seed ${seed}`).toBe(2 * bal.stacks.basicBlow);
    }
  });

  it("a finisher applies basicFinisher of the secondary it discharges; Twin Fang's extra hit applies none", () => {
    const pair = { pair: { primary: 'fire', secondary: 'storm' } } as const;
    const fin = strikeWorld(sword, pair, true);
    firstBlow(fin);
    expect(fin.monsters[0].status.stacks).toMatchObject({
      storm: bal.stacks.basicFinisher,
      fire: 0,
    });
    const twin = strikeWorld(sword, { ...pair, legendaries: { twin_fang: 100 } }, true);
    firstBlow(twin);
    expect(twin.monsters[0].status.stacks.storm).toBe(bal.stacks.basicFinisher);
  });

  it("a ranged blow's shot carries its count to what it hits", () => {
    const w = strikeWorld({ weapon: gear('fire', 'weapon', 'staff') }, {}, false, dummy(13, 30));
    firstBlow(w);
    expect(w.projectiles.find((p) => p.owner === 'hero')).toMatchObject({
      applies: ['burn'],
      stacks: bal.stacks.basicBlow,
    });
    w.hero.nextAttackAt = 1e9;
    run(w, 1);
    expect(w.monsters[0].status.stacks.fire).toBe(bal.stacks.basicBlow);
  });

  it("an ability's direct hit applies its weight's stacks", () => {
    const stats = computeHeroStats({}, registry);
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
    }
  });

  it('its chain jumps and zone ticks apply stacks.tick', () => {
    const chain = arena([dummy(13, 30), dummy(15, 30)], {
      noBasic: true,
      primary: { elements: ['storm'] },
    });
    press(chain, 0, { x: 13, y: 30 });
    run(chain, 1);
    expect(chain.monsters.map((m) => m.status.stacks.storm)).toEqual([
      bal.stacks.byWeight[2],
      bal.stacks.tick,
    ]);

    const zone = arena([dummy(13, 28)], {
      noBasic: true,
      ultimate: { form: 'maelstrom', payment: 'mana' },
    });
    press(zone, 2, { x: 13, y: 28 });
    run(zone, 0.1); // the first tick
    expect(zone.monsters[0].status.stacks.fire).toBe(bal.stacks.tick);
  });
});
```

(The chain test is the combat-weight suite's geometry: a Storm Bolt bursts on the first dummy and jumps to the second, 2 apart. The Maelstrom's first tick is 0.05 s after it lands.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts)`
Expected: 5 FAIL, 15 PASS: "seed 1: expected 1 to be 2" (the roll); "expected { fire: +0, frost: +0, storm: 1, …(3) } to match object { storm: 2, fire: +0 }"; "expected { owner: 'hero', form: null, …(20) } to match object { applies: [ 'burn' ], stacks: 1 }"; "expected [ undefined, undefined, …(3) ] to deeply equal [ 1, 1, 2, 3, 3 ]"; "expected [ 1, 1 ] to deeply equal [ 2, 1 ]".

- [ ] **Step 3: The types**

In `src/types/arpg.ts`, `Projectile`: after

```ts
  /** A basic shot from an Earth source: its stagger rattles (see `HitOpts.rattles`). */
  rattles?: boolean;
```

add

```ts
  /** A basic shot's stacks (see `HitOpts.stacks`). */
  stacks?: number;
```

and in `Zone`, delete the line `  applies: StatusId[];` (the one after `  element: ManaType | null;`, above `  /** Telegraph / Barrage impact / thrown Burst: explodes at this time (0 = lingering zone). */`).

In `src/types/ability.ts` (CRLF, hand-edit), `ResolvedAbility`: after

```ts
  /** Direct hits stagger (Crushing). */
  heavyStagger: boolean;
```

add

```ts
  /** Stacks each direct hit applies (by weight, `stacks.byWeight`). */
  stacks: number;
```

In `src/arpg/abilities/resolve.ts` (CRLF, hand-edit): after `    heavyStagger: w >= 2,` add `    stacks: bal.stacks.byWeight[wi],`.

- [ ] **Step 4: The counts at their sources**

In `src/arpg/abilities/impact.ts`, `hitOpts`: its comment

```ts
/**
 * How an ability's knobs shape each of its hits. `tick` hits (zone ticks,
 * embers) can't crit or knock back; only `direct` hits (the ability landing,
 * not chain jumps or ticks) get the weight's heavy payoff and carry heft.
 */
```

becomes

```ts
/**
 * How an ability's knobs shape each of its hits. `tick` hits (zone ticks,
 * embers) can't crit or knock back; only `direct` hits (the ability landing,
 * not chain jumps or ticks) get the weight's heavy payoff and stacks, and carry
 * heft (the rest apply `stacks.tick`).
 */
```

and after `    rattles: ab.elements.includes('earth'),` add `    stacks: direct ? ab.stacks : undefined,`. In `leaveZone`, delete `    applies: ab.knobs.applies,` (the zone's, after `    element: ab.element,`).

In `src/arpg/abilities/forms.ts`, delete the three zones' `applies` lines: in `case 'burst':` (`        applies: ab.knobs.applies,` above `        detonateAt: land,`), in `case 'barrage':` (`          applies: ab.knobs.applies,` above `          detonateAt: at,`) and in `case 'maelstrom':` (`        applies: ab.knobs.applies,` above `        detonateAt: 0,`). The Bolt's and Volley's projectiles keep theirs.

In `src/arpg/step.ts`: in `projectilesTick`'s basic shot, after `          rattles: p.rattles,` add `          stacks: p.stacks,`; in `bossSpecial`'s slam zone, delete `      applies: [],` (above `      detonateAt: world.t + 1.2,`; the monster projectiles keep theirs).

In `src/arpg/basic.ts`:
- delete `const BASIC_STATUS_CHANCE = 0.3;` and the blank line after it;
- in `strike`, the lines

```ts
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (discharge && element) {
    // A discharge always applies the secondary's status (immunities still hold).
    if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  } else if (element) {
    const chance = element === 'earth' ? BASIC_STATUS_CHANCE * 0.6 : BASIC_STATUS_CHANCE;
    const status = BASIC_STATUS[element];
    if (!applies.includes(status) && world.rng.next() < chance) applies.push(status);
  }
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  // An Earth blow (a discharge included) or an Earth Surge's statuses: its stagger rattles.
```

become

```ts
  // Every blow applies its element's stacks (a Surge's statuses ride along), the finisher more.
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (element && !applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  if (s.stagger && !applies.includes('stagger')) applies.push('stagger');
  const stacks = last ? bal.stacks.basicFinisher : bal.stacks.basicBlow;
  // An Earth blow (a discharge included) or an Earth Surge's statuses: its stagger adds Earth stacks.
```

- the melee hit and Twin Fang's

```ts
        rattles,
        ...kb,
      });
      // Twin Fang: today's finisher value (×1.5) on melee.
      if (twin)
        hitMonster(ctx, m, unit * 1.5 * twinPct, element, { source: 'basic', crit, heft: s.heft });
```

become

```ts
        rattles,
        stacks,
        ...kb,
      });
      // Twin Fang: today's finisher value (×1.5) on melee; it applies no stacks.
      if (twin)
        hitMonster(ctx, m, unit * 1.5 * twinPct, element, {
          source: 'basic',
          crit,
          heft: s.heft,
          stacks: 0,
        });
```

- in the ranged branch's `spawnProjectile`, `        // Twin Fang's extra shot: today's value (×1.0) and never an explosion.` becomes `        // Twin Fang's extra shot: today's value (×1.0), never an explosion, and no stacks.`, `        applies,` becomes `        applies: i === 0 ? applies : [],`, and after `        rattles,` add `        stacks: i === 0 ? stacks : 0,`;
- in `burstShot`, after `      rattles: p.rattles,` add `      stacks: p.stacks,`.

(A Twin Fang shot or hit brings `stacks: 0`: it can still pair stacks the foe already has, behind the finisher's lockout, as the spec says.)

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts && npx tsc --noEmit -p .)`
Expected: 20 PASS; no type errors.

- [ ] **Step 5: See what else moved**

Run: `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts)`
Expected: 72 files, 1166 tests, all green: no existing assertion depended on the roll's draw. Step 6 still updates three tests whose setup no longer matches the code.

- [ ] **Step 6: The tests that named the roll or `Zone.applies`**

`tests/delve-reactions.test.ts` ("a ranged Earth blow rattles…"): the two lines

```ts
    expect(p).toMatchObject({ element: 'earth', rattles: true });
    p.applies = ['stagger']; // its 18% roll, made certain
```

become

```ts
    expect(p).toMatchObject({
      element: 'earth',
      rattles: true,
      applies: ['stagger'],
      stacks: bal.stacks.basicBlow,
    });
```

`tests/delve-combat-weight.test.ts` ("ranged Twin Fang fires a second shot…"): after `    expect(w.projectiles[1].explodeRadius).toBe(0);` add

```ts
    // It applies nothing: its stacks can only pair what the foe already has.
    expect(w.projectiles[1]).toMatchObject({ applies: [], stacks: 0 });
```

Delete the zone literals' `applies: [],` line (only in `w.zones.push({ … })` objects; projectiles keep theirs): `tests/arpg-sim.test.ts` "boss slams hurt only inside the telegraph" (both zones), `tests/delve-dodge.test.ts` (the zone above `      detonateAt: w.t + 0.13,`), `tests/delve-infusion.test.ts` (above `      detonateAt: w.t,`) and `tests/delve-training.test.ts` (above `        detonateAt: w.t + 1.2,`).

Run: `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts && npx tsc --noEmit -p .)`
Expected: 72 files, 1166 tests, all green; no type errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-dodge.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/types/ability.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts packages/engine/tests/delve-combat-weight.test.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-dodge.test.ts packages/engine/tests/delve-infusion.test.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): every hit carries its stack count; the basic attack's status roll goes" -m "Pacing rails (tests/delve-pacing.test.ts) not run: the stacks model is whole only after Task 5 (they pass on the scratch copy)." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 4: Engine: pairing

### Task 4: Stacks pair off

The spec's Pairing section, in its order. `findPair` replaces `findReaction`: `before[F]` is the partner's raw count (a bare freeze counts as one frost stack, as a partner only), `total_E = min(cap, stacks[E] + k)` from the hit's own raw count, the fixed walk skips a buff on its hero-side cooldown and Earth on a chilled-but-not-frozen foe, and nothing pairs while the foe's lockout runs. The reaction reads the foe before its pairs come off (so Blight spreads what the foe has now); damage is dealt; a kill ends it there; otherwise the hit's own element's stacks go on, `consumePairs` takes `n` off both sides (a freeze ends only when frost was the partner, and not under Superconduct), the hit's other statuses go on, and the freeze check runs once. `consumes` leaves the data: Soulfire and Blight consume like the rest. `react` gets its `n` in Task 5.

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`ReactionDef`; `StatusState.reactionLockUntil`; `pairs` on the `hit` and `reaction` events)
- Modify: `packages/engine/src/arpg/world.ts` (`emptyStatus`)
- Modify: `packages/engine/src/data/schemas.ts:589` (`consumes`)
- Modify: `packages/engine/src/data/arpg.json:157`, `:159` (hand-edit)
- Modify: `packages/engine/src/arpg/combat.ts` (after Task 3: `HitOpts.stacks`' doc `:58-61`; `noteReaction` `:300-303`; `findReaction` through `react`'s comment `:312-347`; `hitMonster` `:503-514`, `:527`, `:567-579`; the text anchors below are what count)
- Modify: `packages/engine/tests/delve-stacks.test.ts` (imports, a helper, three new `describe`s)
- Modify: `packages/engine/tests/delve-reactions.test.ts` (Step 6)

- [ ] **Step 1: Write the failing tests**

In `tests/delve-stacks.test.ts`: in the import from `'../src/arpg/combat.js'` add `  freeze,` after `  applyStatus,` and `  type HitOpts,` after `  makeCtx,`; after the `setup` function add

```ts

/** The reactions that fired, each with the pairs it consumed. */
const fired = (events: ArpgEvent[]) =>
  events.flatMap((e) => (e.kind === 'reaction' ? [[e.reaction, e.pairs]] : []));
```

and append to the end of the file:

```ts

describe('pairing', () => {
  it('a hit pairs only with earlier stacks: a fused Steam hit sets up, the next Melts without a phantom freeze', () => {
    const { ctx, m, events } = setup();
    const steam: HitOpts = { source: 'skill', applies: ['burn', 'chill'], stacks: 2 };
    hitMonster(ctx, m, 10, 'fire', steam);
    expect(fired(events)).toEqual([]);
    expect(m.status.stacks).toMatchObject({ fire: 2, frost: 2 });
    hitMonster(ctx, m, 10, 'fire', steam);
    // Its fire goes on, two pairs come off, then its frost: two before and after, no crossing.
    expect(fired(events)).toEqual([['melt', 2]]);
    expect(m.status.stacks).toMatchObject({ fire: 2, frost: 2 });
    expect(isFrozen(ctx, m)).toBe(false);
  });

  it('the first partner in MANA_TYPES order pairs, n is the smaller count, and the rest stays', () => {
    const { ctx, m, events } = setup();
    applyStatus(ctx, m, 'shock', 0, false, undefined, 3);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 1);
    hitMonster(ctx, m, 10, 'frost', { source: 'skill', applies: ['chill'], stacks: 2 });
    // Fire comes before Storm, and has one stack: one pair.
    expect(fired(events)).toEqual([['melt', 1]]);
    expect(m.status.stacks).toMatchObject({ fire: 0, frost: 1, storm: 3 });
  });

  it("the hit's own element counts what the foe already had", () => {
    const { ctx, m, events } = setup();
    m.status.stacks.fire = 2;
    m.status.stacks.frost = 3;
    hitMonster(ctx, m, 10, 'fire', { source: 'skill', stacks: 1 });
    // Two fire on the foe and one from the hit: three pairs with the three frost.
    expect(fired(events)).toEqual([['melt', 3]]);
    expect(m.status.stacks).toMatchObject({ fire: 0, frost: 0 });
  });

  it('a bare freeze is one frost stack to a partner: Earth Shatters it, Fire Melts it, and either ends it', () => {
    for (const [hit, id] of [
      ['earth', 'shatter'],
      ['fire', 'melt'],
    ] as const) {
      const { ctx, m, events } = setup();
      freeze(ctx, m, 5);
      hitMonster(ctx, m, 10, hit, { source: 'skill', stacks: 2 });
      expect(fired(events), hit).toEqual([[id, 1]]);
      expect(isFrozen(ctx, m), hit).toBe(false);
    }
  });

  it('a frost hit pairs no freeze of its own, and its pair never ends one', () => {
    const bare = setup();
    freeze(bare.ctx, bare.m, 5);
    hitMonster(bare.ctx, bare.m, 10, 'frost', { source: 'skill', applies: ['chill'], stacks: 1 });
    expect(fired(bare.events)).toEqual([]);
    expect(isFrozen(bare.ctx, bare.m)).toBe(true);
    // Frost on a rattled frozen foe: Shatter from the frost side, so the freeze holds.
    const rattled = setup();
    freeze(rattled.ctx, rattled.m, 5);
    applyStatus(rattled.ctx, rattled.m, 'stagger', 0, true);
    hitMonster(rattled.ctx, rattled.m, 10, 'frost', { source: 'skill', stacks: 1 });
    expect(fired(rattled.events)).toEqual([['shatter', 1]]);
    expect(isFrozen(rattled.ctx, rattled.m)).toBe(true);
  });

  it('a killing reaction consumes nothing: what reads the corpse sees its stacks as they were', () => {
    const { w, ctx } = setup([dummy(13, 20, { hp: 1 }), dummy(14.5, 20)]);
    const [a, b] = w.monsters;
    a.status.stacks.frost = 3;
    applyStatus(ctx, a, 'poison', 100, false, undefined, 3);
    applyStatus(ctx, a, 'hex', 0, false, undefined, 2);
    // Fire meets Frost first: Melt, and the hit kills. Plague spreads from the corpse.
    hitMonster(ctx, a, 10, 'fire', { source: 'skill', stacks: 1, spread: true });
    expect(a.dead).toBe(true);
    expect(a.status.stacks).toMatchObject({ frost: 3, nature: 3, shadow: 2 });
    expect(b.status.stacks).toMatchObject({ nature: 3, shadow: 2 });
  });
});

describe('consuming', () => {
  it('a pair ends a freeze only from the partner side, and Superconduct keeps it', () => {
    const onFrozen = (hit: ManaType) => {
      const { ctx, m, events } = setup();
      applyStatus(ctx, m, 'chill', 0, false, undefined, 3); // three frost: frozen
      hitMonster(ctx, m, 10, hit, { source: 'skill', stacks: 1 });
      return [fired(events)[0][0], isFrozen(ctx, m), m.status.stacks.frost];
    };
    expect(onFrozen('fire')).toEqual(['melt', false, 2]);
    expect(onFrozen('earth')).toEqual(['shatter', false, 2]);
    expect(onFrozen('nature')).toEqual(['crystallize', false, 2]);
    expect(onFrozen('shadow')).toEqual(['siphon', false, 2]);
    expect(onFrozen('storm')).toEqual(['superconduct', true, 2]);
  });

  it('a count stops at 0 and its status with it; Soulfire and Blight consume like the rest', () => {
    const soul = setup();
    applyStatus(soul.ctx, soul.m, 'hex', 0, false, undefined, 2);
    hitMonster(soul.ctx, soul.m, 10, 'fire', { source: 'skill', applies: ['burn'], stacks: 1 });
    expect(fired(soul.events)).toEqual([['soulfire', 1]]);
    // Its burn went on and came off with the pair: no burn ticks.
    expect(soul.m.status.stacks).toMatchObject({ shadow: 1, fire: 0 });
    expect(run(soul.w, 1).some((e) => e.kind === 'hit' && e.source === 'dot')).toBe(false);
    const blight = setup();
    applyStatus(blight.ctx, blight.m, 'poison', 100, false, undefined, 2);
    hitMonster(blight.ctx, blight.m, 10, 'shadow', { source: 'skill', stacks: 1 });
    expect(fired(blight.events)).toEqual([['blight', 1]]);
    expect(blight.m.status.stacks.nature).toBe(1);
  });
});

describe('the lockout', () => {
  it('a reaction locks the foe for reactionLockout: stacks build meanwhile, and the next pairs more', () => {
    const { w, ctx, m, events } = setup();
    const frostHit: HitOpts = { source: 'skill', applies: ['chill'], stacks: 1 };
    applyStatus(ctx, m, 'burn', 100, false, undefined, 2);
    hitMonster(ctx, m, 10, 'frost', frostHit); // Melt, one pair
    expect(m.status.reactionLockUntil).toBeCloseTo(w.t + bal.stacks.reactionLockout);
    applyStatus(ctx, m, 'burn', 100, false, undefined, 2);
    hitMonster(ctx, m, 10, 'frost', frostHit);
    hitMonster(ctx, m, 10, 'frost', frostHit);
    expect(fired(events)).toEqual([['melt', 1]]);
    expect(m.status.stacks).toMatchObject({ fire: 3, frost: 2 });
    w.t = m.status.reactionLockUntil;
    hitMonster(ctx, m, 10, 'frost', frostHit);
    expect(fired(events)).toEqual([
      ['melt', 1],
      ['melt', 3],
    ]);
    // The reacting hits carry their pairs too.
    const reacting = events.filter(
      (e): e is Extract<ArpgEvent, { kind: 'hit' }> => e.kind === 'hit' && !!e.reaction,
    );
    expect(reacting.map((e) => e.pairs)).toEqual([1, 3]);
  });

  it("a buff reaction's hero-side cooldown still holds on another foe", () => {
    const { w, ctx, events } = setup([dummy(13, 20), dummy(16, 20)]);
    for (const foe of w.monsters) {
      applyStatus(ctx, foe, 'stagger', 0, true);
      applyStatus(ctx, foe, 'hex', 0);
    }
    hitMonster(ctx, w.monsters[0], 10, 'fire', { source: 'skill' }); // Earth before Shadow: Obsidian
    hitMonster(ctx, w.monsters[1], 10, 'fire', { source: 'skill' }); // Obsidian cools down: Soulfire
    expect(fired(events).map(([id]) => id)).toEqual(['obsidian', 'soulfire']);
  });
});
```

(How the numbers come out: in the Steam test the second hit's fire makes 4, two pairs take fire and frost to 2 and 0, and its chill puts frost back at 2, so frost never crossed 3 on the way. In the lockout test the first Melt leaves fire 1; two more burn stacks make 3 and two locked frost hits make 2; past the lockout the next frost hit brings its own stack, 2 + 1 = 3, against fire's 3.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts)`
Expected: 9 FAIL, 21 PASS. The failures: the reaction events carry no `pairs` yet ("expected [ [ 'melt', undefined ] ] to deeply equal [ [ 'melt', 2 ] ]" and the like), "expected [ 'melt', false, +0 ] to deeply equal [ 'melt', false, 2 ]" (today's all-or-nothing use-up), "expected { Object (fire, frost, ...) } to match object { frost: 3, nature: 3, shadow: 2 }" (today the Melt uses up the frost before the killing damage lands), and "expected undefined to be close to 1" (no lockout). "a buff reaction's hero-side cooldown still holds on another foe" passes already: it guards what must not change.

- [ ] **Step 3: The types and the data**

In `src/types/arpg.ts`:
- `ReactionDef`: the comment `/** A hit of either element on a foe carrying the other's mark sets it off (see the pair reactions spec). */` becomes `/** A hit of either element pairs its stacks off with the other's on a foe to set it off (see the elemental stacks spec). */`, and delete the two lines `  /** False: the mark that set it off stays (Soulfire, Blight). */` and `  consumes?: false;`;
- `StatusState`: after `  rootImmuneUntil: number;` (its last field) add

```ts
  /** No reaction fires on the foe before this time (`stacks.reactionLockout` after one does). */
  reactionLockUntil: number;
```

- the `hit` event: after `      reaction?: ReactionId;` add

```ts
      /** The pairs of stacks the reaction consumed (see the `reaction` event). */
      pairs?: number;
```

- the `reaction` event, `  | { kind: 'reaction'; reaction: ReactionId; x: number; y: number }`, becomes

```ts
  | {
      kind: 'reaction';
      reaction: ReactionId;
      x: number;
      y: number;
      /** How many pairs of stacks it consumed: damage reactions scale with it. */
      pairs?: number;
    }
```

In `src/arpg/world.ts`, `emptyStatus()`: after `    rootImmuneUntil: 0,` add `    reactionLockUntil: 0,`.

In `src/data/schemas.ts`, `ArpgDataSchema.reactions`: delete `        consumes: z.literal(false).optional(),`.

In `src/data/arpg.json` (hand-edit): in the `soulfire` and `blight` entries delete `"consumes": false, ` (so they read `{ "id": "soulfire", "elements": ["fire", "shadow"], "name": "Soulfire", …` and `{ "id": "blight", "elements": ["shadow", "nature"], "name": "Blight", …`).

- [ ] **Step 4: Pairing in `combat.ts`**

1. `HitOpts`: the `stacks` doc

```ts
  /**
   * Stacks the hit applies of each element status in `applies` (default `stacks.tick`; see
   * the elemental stacks spec).
   */
```

becomes

```ts
  /**
   * Stacks the hit applies of each element status in `applies`, and brings to a pairing
   * (default `stacks.tick`; see the elemental stacks spec).
   */
```

2. `noteReaction` (the whole function):

```ts
function noteReaction(ctx: SimCtx, reaction: ReactionId, m: MonsterEntity, pairs: number): void {
  ctx.events.push({ kind: 'reaction', reaction, x: m.x, y: m.y, pairs });
  if (!ctx.world.pending.reactions.includes(reaction)) ctx.world.pending.reactions.push(reaction);
}
```

3. Everything from `findReaction`'s doc comment (line 312, the `/**` above "The reaction a hit of `element` sets off on `m`: the first other element's") through the end of `react`'s doc comment (line 347, the ` */` after "ability slot, which its splash carries."), i.e. `findReaction`, the interim `useUpMark` and `react`'s comment, becomes

```ts
/**
 * What a hit of `element` bringing `k` stacks pairs with on `m`: the first other element in
 * MANA_TYPES order with stacks from earlier hits (a bare freeze counts as one frost stack) whose
 * reaction can fire, and `n`, the pairs (see the elemental stacks spec); null while the foe's
 * lockout runs, or if nothing pairs.
 */
function findPair(
  ctx: SimCtx,
  m: MonsterEntity,
  element: ManaType,
  k: number,
): { def: ReactionDef; partner: ManaType; n: number } | null {
  const s = m.status;
  const t = ctx.world.t;
  // This hit's own element pairs from its raw count: a frost hit never pairs a freeze it has no stacks for.
  const total = Math.min(stackCap(ctx, element), s.stacks[element] + k);
  if (total <= 0 || t < s.reactionLockUntil) return null;
  const frozen = isFrozen(ctx, m);
  for (const partner of MANA_TYPES) {
    if (partner === element) continue;
    const before = partner === 'frost' && frozen ? Math.max(1, s.stacks.frost) : s.stacks[partner];
    if (before <= 0) continue;
    // Earth shatters a freeze, not a mere chill.
    if (element === 'earth' && partner === 'frost' && !frozen) continue;
    const def = ctx.registry.getReactionFor(element, partner);
    // A buff reaction on its own cooldown can't fire.
    if (def.cooldown && t < (ctx.world.hero.reactionReadyAt[def.id] ?? 0)) continue;
    return { def, partner, n: Math.min(total, before) };
  }
  return null;
}

/**
 * Take `n` stacks off both sides of a pair (a count stops at 0, and its status with it). A
 * freeze ends when frost was the partner, except under Superconduct, which keeps it.
 */
function consumePairs(
  m: MonsterEntity,
  element: ManaType,
  partner: ManaType,
  n: number,
  reaction: ReactionId,
): void {
  const s = m.status;
  s.stacks[element] = Math.max(0, s.stacks[element] - n);
  s.stacks[partner] = Math.max(0, s.stacks[partner] - n);
  if (partner === 'frost' && reaction !== 'superconduct') s.freezeUntil = 0;
}

/**
 * A reaction's effect on `m`, before its pairs come off. Returns the hit's
 * amount after it: the damage multipliers, times Catalyst. `slot`: the hit's
 * ability slot, which its splash carries.
 */
```

(`consumePairs` takes the reaction too, beyond the spec's `(m, E, F, n)`: Superconduct's exception needs it.)

4. `hitMonster`, the reaction block

```ts
  // Elemental reactions: this hit's element meets another element's mark on the foe.
  const frostBefore = stacks.frost;
  let reaction: ReactionId | undefined;
  const found = element && !opts.noReact ? findReaction(ctx, m, element) : null;
  if (found) {
    reaction = found.def.id;
    if (found.def.consumes !== false) useUpMark(m, found.mark, reaction);
    amount = react(ctx, m, reaction, amount, opts.slot);
    if (found.def.cooldown) h.reactionReadyAt[reaction] = world.t + bal.reactions.reactionCooldown;
    noteReaction(ctx, reaction, m);
    if (reaction === 'soulfire') healHero(ctx, amount * bal.reactions.soulfireHeal, 'soulfire');
  }
```

becomes

```ts
  // Elemental reactions: this hit's stacks pair off with another element's from earlier hits.
  const k = opts.stacks ?? bal.stacks.tick;
  const frostBefore = stacks.frost;
  let reaction: ReactionId | undefined;
  const pair = element && !opts.noReact ? findPair(ctx, m, element, k) : null;
  if (pair) {
    reaction = pair.def.id;
    amount = react(ctx, m, reaction, amount, opts.slot);
    m.status.reactionLockUntil = world.t + bal.stacks.reactionLockout;
    if (pair.def.cooldown) h.reactionReadyAt[reaction] = world.t + bal.reactions.reactionCooldown;
    noteReaction(ctx, reaction, m, pair.n);
    if (reaction === 'soulfire') healHero(ctx, amount * bal.reactions.soulfireHeal, 'soulfire');
  }
```

5. The `hit` event: after its `    reaction,` add `    ...(pair ? { pairs: pair.n } : {}),` (as `hurtHero`'s `blocked`: a hit that didn't react carries no `pairs` key; the first `hit` push only; Soulfrost's execute pseudo-hit below keeps no `pairs`, so its label stays plain).

6. After `  if (m.dummy && m.hp <= 0) m.hp = m.maxHp;` add `  // A kill consumes nothing: what reads the corpse sees its stacks as they were.` above `  if (m.hp <= 0) {`; and the statuses

```ts
  const k = opts.stacks ?? bal.stacks.tick;
  for (const s of opts.applies ?? []) addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k);
  // The riposte staggers; it adds no stacks.
  if (riposte) addStatus(ctx, m, 'stagger', amount, false, undefined, 0);
  // Frost freezes only if the hit's final count crossed the threshold.
  crossFreeze(ctx, m, frostBefore);
```

become

```ts
  // The hit's own element's stacks, then the pairs come off both sides, then its other
  // statuses; frost freezes only if its final count crossed the threshold.
  const applies = opts.applies ?? [];
  const own = element ? BASIC_STATUS[element] : null;
  const add = (s: StatusId) => addStatus(ctx, m, s, amount, opts.rattles, opts.slot, k);
  if (own && applies.includes(own)) add(own);
  if (element && pair) consumePairs(m, element, pair.partner, pair.n, pair.def.id);
  for (const s of applies) if (s !== own) add(s);
  // The riposte staggers; it adds no stacks.
  if (riposte) addStatus(ctx, m, 'stagger', amount, false, undefined, 0);
  crossFreeze(ctx, m, frostBefore);
```

(A hit whose `applies` lacks its own element's status, as the tests' bare hits do, still brings `k` to the pair; its count stops at 0.)

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts && npx tsc --noEmit -p .)`
Expected: 30 PASS; no type errors.

Run: `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts)`
Expected: 10 FAIL, all in `tests/delve-reactions.test.ts`: "Soulfire and Blight keep their mark…" ("expected [] to deeply equal [ 'soulfire', 'blight' ]"); eight of "every pair reacts, both ways" (the old all-or-nothing use-up: melt, superconduct and siphon and crystallize with a frost mark, both Soulfires, both Blights); and "the Training Grounds get them too…" ("expected [ 'orb' ] to deeply equal [ 'orb', 'mote', 'mote', 'mote' ]": the dummy's lockout). Step 6 updates them.

- [ ] **Step 6: The reaction tests use up pairs**

In `tests/delve-reactions.test.ts`:

1. "the reaction table": the test

```ts
  it('Soulfire and Blight keep their mark; the five buff reactions have a cooldown', () => {
    const reactions = registry.getArpgData().reactions;
    expect(reactions.filter((r) => r.consumes === false).map((r) => r.id)).toEqual([
      'soulfire',
      'blight',
    ]);
```

begins instead

```ts
  it('every reaction uses up its pairs; the five buff reactions have a cooldown', () => {
    const reactions = registry.getArpgData().reactions;
    expect(reactions.some((r) => 'consumes' in r)).toBe(false);
```

(its cooldown check below stays).

2. "every pair reacts, both ways" (the `it.each`): the lines from `    if (id === 'soulfire' || id === 'blight') expect(hasMark(ctx, m, marked)).toBe(true);` through `    } else expect(hasMark(ctx, m, marked)).toBe(false);`

```ts
    if (id === 'soulfire' || id === 'blight') expect(hasMark(ctx, m, marked)).toBe(true);
    else if (id === 'shatter' && hit === 'earth') {
      // Earth breaks the freeze and leaves the chill.
      expect(isFrozen(ctx, m)).toBe(false);
      expect(isChilled(ctx, m)).toBe(true);
    } else if (id === 'superconduct' && hit === 'storm') {
      // Storm takes the chill and leaves the freeze (freezing again would be refused).
      expect(isChilled(ctx, m)).toBe(false);
      expect(m.status.stacks.frost).toBe(0);
      expect(isFrozen(ctx, m)).toBe(true);
    } else expect(hasMark(ctx, m, marked)).toBe(false);
```

become

```ts
    // One pair comes off both sides: the mark drops by one (a frost mark's three leave two), and
    // a freeze ends when frost was the partner, except under Superconduct.
    expect(m.status.stacks[marked]).toBe(marked === 'frost' ? 2 : 0);
    expect(m.status.stacks[hit]).toBe(0);
    expect(isFrozen(ctx, m)).toBe(id === 'superconduct');
```

(The file's `mark()` gives one stack (`stacks.tick`); a Frost mark is one chill plus a freeze, whose `freeze` status raises frost to `freezeAt`, three, and freezes. The reacting hit brings one stack and applies nothing, so one pair comes off.)

3. "Seedling and Siphon" › "the Training Grounds get them too…": after `    hitMonster(ctx, d, 10, 'earth', { source: 'skill' }); // Seedling` add `    w.t += bal.stacks.reactionLockout; // the dummy's lockout`.

Run: `(cd packages/engine && npx vitest run --exclude tests/delve-pacing.test.ts && npx tsc --noEmit -p .)`
Expected: 72 files, 1176 tests, all green; no type errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/data/schemas.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/data/schemas.ts packages/engine/src/data/arpg.json packages/engine/src/arpg/combat.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): stacks pair off into reactions, behind a per-foe lockout" -m "Pacing rails (tests/delve-pacing.test.ts) not run: the stacks model is whole only after Task 5 (they pass on the scratch copy)." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: What each reaction takes and gives, and the texts

The spec's steps 4 and 6 and its Reaction strength table. A damage reaction (Melt, Shatter, Overload, Combust, Crystallize: `DAMAGE_REACTIONS`) takes every pair, `n`, and adds its bonus once per pair, `hit × (1 + (mult − 1) × n × catalyst)`; Overload's blast is `hit × overloadMult × n × catalyst`. The other ten are effects: they fire once and take one pair (the spec's `c`), so the rest of both statuses stay on the foe. `findPair` returns the pairs a reaction takes, so `react`, `consumePairs` and the events' `pairs` all read one number. Catalyst now scales the bonus, not the whole hit (with one pair and no Catalyst the numbers are today's). The element texts say stacks. With this the pacing rails hold again.

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts` (after Task 4: above `findPair` `:312`, its doc `:315-316` and return `:339`; `react` `:361-383`, `:402`, `:449`; `hitMonster` `:528`; the text anchors below are what count)
- Modify: `packages/engine/src/types/delve.ts` (the `reactions` docs)
- Modify: `packages/engine/src/data/arpg.json:50`, `:76`, `:81`, `:86`, `:96` (hand-edit)
- Modify: `packages/engine/tests/delve-stacks.test.ts` (a new `describe`)
- Modify: `packages/engine/tests/delve-reactions.test.ts` (the Catalyst test)

- [ ] **Step 1: Write the failing tests**

Append to `tests/delve-stacks.test.ts`:

```ts

describe('strength', () => {
  const DAMAGE = [
    ['melt', 'fire', 'frost', 'meltMult'],
    ['shatter', 'earth', 'frost', 'shatterMult'],
    ['combust', 'fire', 'nature', 'combustMult'],
    ['crystallize', 'nature', 'frost', 'crystallizeMult'],
  ] as const;

  it.each(DAMAGE)('%s adds its bonus per pair and takes every pair', (id, hit, partner, mult) => {
    // Shadow foes: neutral to all four hits and to Combust's Fire splash.
    const foes = () =>
      setup([dummy(13, 20, { element: 'shadow' }), dummy(14.5, 20, { element: 'shadow' })]);
    const p = foes();
    const plain = hitMonster(p.ctx, p.m, 100, hit, { source: 'skill', stacks: 1 });
    for (const n of [1, 2, 3]) {
      const { w, ctx, m, events } = foes();
      m.status.stacks[partner] = n;
      if (id === 'shatter') freeze(ctx, m, 5); // Earth shatters only a freeze
      const dealt = hitMonster(ctx, m, 100, hit, { source: 'skill', stacks: n });
      expect(fired(events), `n ${n}`).toEqual([[id, n]]);
      expect(dealt / plain, `n ${n}`).toBeCloseTo(1 + (bal.reactions[mult] - 1) * n);
      expect(m.status.stacks[partner], `n ${n}`).toBe(0);
      // Combust's splash deals the same amount.
      if (id === 'combust') expect(w.monsters[1].maxHp - w.monsters[1].hp).toBeCloseTo(dealt);
    }
  });

  it("Overload's blast grows with the pairs", () => {
    const blast = (n: number) => {
      const { w, ctx, m } = setup([dummy(13, 20), dummy(14.5, 20)]);
      m.status.stacks.fire = n;
      hitMonster(ctx, m, 100, 'storm', { source: 'skill', stacks: n });
      return w.monsters[1].maxHp - w.monsters[1].hp;
    };
    expect(blast(2) / blast(1)).toBeCloseTo(2);
    expect(blast(3) / blast(1)).toBeCloseTo(3);
  });

  it('a boss takes the full per-pair scaling', () => {
    const melt = (n: number) => {
      const { ctx, m } = setup([dummy(13, 20, { kind: 'boss', element: 'shadow' })]);
      m.status.stacks.frost = n;
      return hitMonster(ctx, m, 100, 'fire', { source: 'skill', stacks: 3 });
    };
    expect(melt(3) / melt(0)).toBeCloseTo(1 + (bal.reactions.meltMult - 1) * 3);
  });

  const EFFECT = [
    ['superconduct', 'storm', 'frost'],
    ['soulfire', 'shadow', 'fire'],
    ['obsidian', 'fire', 'earth'],
    ['lightning_rod', 'storm', 'earth'],
    ['sunder', 'shadow', 'earth'],
    ['seedling', 'earth', 'nature'],
    ['siphon', 'shadow', 'frost'],
    ['blackout', 'storm', 'shadow'],
    ['galvanize', 'storm', 'nature'],
  ] as const;

  it.each(EFFECT)('%s fires once, whatever the pairs, and takes one', (id, hit, partner) => {
    const outcome = (n: number) => {
      const { w, ctx, m, events } = setup([dummy(13, 20), dummy(14.5, 20)]);
      const h = w.hero;
      // Room for each effect to show: a heal, a dodge to give back, a cooldown to cut.
      h.hp = 1;
      h.dodgeCharges = 0;
      h.cooldowns[0] = 5;
      m.status.stacks[partner] = n;
      const dealt = hitMonster(ctx, m, 100, hit, { source: 'skill', stacks: n });
      expect(fired(events), `n ${n}`).toEqual([[id, 1]]);
      // One pair comes off; the rest of the partner's stacks stay.
      expect(m.status.stacks[partner], `n ${n}`).toBe(n - 1);
      // Only the partner's own stacks change the hit: a hexed foe takes more from every hit.
      const taken =
        1 + (partner === 'shadow' ? bal.stacks.hexPerStack * bal.stacks.curve[n - 1] : 0);
      return {
        hit: dealt / taken,
        barrier: h.barrier?.hp,
        dodges: h.dodgeCharges,
        quick: h.quickUntil,
        cooldown: h.cooldowns[0],
        drops: w.drops.map((d) => d.kind),
        frozen: isFrozen(ctx, m),
        sunder: m.status.sunderUntil,
        blind: w.monsters.map((foe) => foe.status.blindUntil),
      };
    };
    const once = outcome(1);
    const thrice = outcome(3);
    expect(thrice.hit).toBeCloseTo(once.hit);
    expect({ ...thrice, hit: 0 }).toEqual({ ...once, hit: 0 });
  });

  it('Blight spreads the counts the foe had before its pair came off, and takes one pair', () => {
    const { w, ctx, m, events } = setup([dummy(13, 20), dummy(14.5, 20)]);
    applyStatus(ctx, m, 'poison', 100, false, undefined, 3);
    hitMonster(ctx, m, 10, 'shadow', { source: 'skill', applies: ['hex'], stacks: 2 });
    expect(fired(events)).toEqual([['blight', 1]]);
    expect(w.monsters[1].status.stacks).toMatchObject({ nature: 3, shadow: 0 });
    expect(m.status.stacks).toMatchObject({ nature: 2, shadow: 1 });
  });

  it('Catalyst scales the bonus, not the hit', () => {
    const dealt = (catalyst: number, n: number) => {
      const { w, ctx, m } = setup();
      w.hero.stats.legendaries.catalyst = catalyst;
      m.status.stacks.frost = n;
      return hitMonster(ctx, m, 100, 'fire', { source: 'skill', stacks: n });
    };
    const hit = dealt(0, 1) / bal.reactions.meltMult; // one pair: ×meltMult
    expect(dealt(50, 2) / hit).toBeCloseTo(1 + (bal.reactions.meltMult - 1) * 2 * 1.5);
  });
});
```

(The effect list picks each pair's direction so the partner is never Storm, whose stacks would change the hit too; Blackout's partner is Shadow either way, so the hex bonus, `hexPerStack × curve`, is divided out. An effect's event carries `pairs: 1`, the pair it took, so its label never reads ×n. Blight's spread depends on the foe's counts by design, so it has its own test: its shadow hit brings two hex stacks and pairs one with the three poison stacks; the neighbour takes the three and no hex, and the foe keeps two poison and one hex. The boss is a Shadow dummy with `kind: 'boss'`: bosses keep their ×0.4 only on freeze and stagger.)

In `tests/delve-reactions.test.ts`, the test from `  it("Catalyst scales the damage reactions and Soulfire's hit", () => {` through its closing `  });`

```ts
  it("Catalyst scales the damage reactions and Soulfire's hit", () => {
    const cases = [
      ['fire', 'frost'],
      ['earth', 'frost'],
      ['fire', 'shadow'],
    ] as const;
    for (const [hit, marked] of cases) {
      const plain = fire(hit, marked);
      const doubled = fire(hit, marked, (s) => (s.w.hero.stats.legendaries.catalyst = 100));
      expect(doubled.dealt / plain.dealt, `${hit} on ${marked}`).toBeCloseTo(2);
    }
  });
```

becomes

```ts
  it("Catalyst scales the damage reactions' bonus and Soulfire's hit", () => {
    const catalyst = (s: ReturnType<typeof setup>) => (s.w.hero.stats.legendaries.catalyst = 100);
    const cases = [
      ['fire', bal.reactions.meltMult],
      ['earth', bal.reactions.shatterMult],
    ] as const;
    for (const [hit, mult] of cases) {
      // One pair: Catalyst doubles the bonus, mult − 1.
      const ratio = fire(hit, 'frost', catalyst).dealt / fire(hit, 'frost').dealt;
      expect(ratio, hit).toBeCloseTo((1 + 2 * (mult - 1)) / mult);
    }
    expect(fire('fire', 'shadow', catalyst).dealt / fire('fire', 'shadow').dealt).toBeCloseTo(2);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts tests/delve-reactions.test.ts)`
Expected: 18 FAIL, 93 PASS. In `delve-stacks`: the four damage reactions at n 2 ("n 2: expected 2 to be close to 3", and 2.5 to 4, 1.6 to 2.2, 1.8 to 2.6; they take every pair already), Overload ("expected 1 to be close to 2"), the boss ("expected 2 to be close to 4"), the nine effect reactions at n 3 ("n 3: expected [ [ 'superconduct', 3 ] ] to deeply equal [ [ 'superconduct', 1 ] ]" and so on: they take every pair today), Blight ("expected [ [ 'blight', 2 ] ] to deeply equal [ [ 'blight', 1 ] ]") and "Catalyst scales the bonus, not the hit" ("expected 3 to be close to 4"); in `delve-reactions`, the Catalyst test ("fire: expected 2 to be close to 1.5": today Catalyst 100 doubles the whole Melt).

- [ ] **Step 3: An effect takes one pair; `react` takes the pairs**

In `src/arpg/combat.ts`, above `findPair`'s doc comment (the `/**` above "What a hit of `element` bringing `k` stacks pairs with on `m`") add

```ts
/** The damage reactions: each pair they take adds to the hit (see `react`); the rest fire once. */
const DAMAGE_REACTIONS = new Set<ReactionId>([
  'melt',
  'shatter',
  'overload',
  'combust',
  'crystallize',
]);
```

In `findPair`'s doc, the lines

```ts
 * reaction can fire, and `n`, the pairs (see the elemental stacks spec); null while the foe's
 * lockout runs, or if nothing pairs.
```

become

```ts
 * reaction can fire, and `n`, the pairs it takes: all it can for a damage reaction, one for an
 * effect (see the elemental stacks spec); null while the foe's lockout runs, or if nothing pairs.
```

and its `    return { def, partner, n: Math.min(total, before) };` becomes

```ts
    // A damage reaction takes every pair; an effect takes one, leaving the rest of both.
    return { def, partner, n: DAMAGE_REACTIONS.has(def.id) ? Math.min(total, before) : 1 };
```

(`consumePairs`, the `reaction` event and the `hit` event already take `pair.n`.)

In `src/arpg/combat.ts`, `react`: its comment and head, through `      const blast = amount * r.overloadMult * catalyst;`

```ts
/**
 * A reaction's effect on `m`, before its pairs come off. Returns the hit's
 * amount after it: the damage multipliers, times Catalyst. `slot`: the hit's
 * ability slot, which its splash carries.
 */
function react(
  ctx: SimCtx,
  m: MonsterEntity,
  id: ReactionId,
  amount: number,
  slot: number | undefined,
): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100;
  switch (id) {
    case 'melt':
      return amount * r.meltMult * catalyst;
    case 'shatter':
      return amount * r.shatterMult * catalyst;
    case 'overload': {
      const blast = amount * r.overloadMult * catalyst;
```

become

```ts
/**
 * A reaction's effect on `m` with `n` pairs, before they come off. Returns the
 * hit's amount after it: a damage reaction adds its bonus once per pair, scaled
 * by Catalyst. `slot`: the hit's ability slot, which its splash carries.
 */
function react(
  ctx: SimCtx,
  m: MonsterEntity,
  id: ReactionId,
  amount: number,
  slot: number | undefined,
  n: number,
): number {
  const r = ctx.bal.reactions;
  const h = ctx.world.hero;
  const t = ctx.world.t;
  const catalyst = 1 + (h.stats.legendaries.catalyst ?? 0) / 100;
  const boost = (mult: number) => 1 + (mult - 1) * n * catalyst;
  switch (id) {
    case 'melt':
      return amount * boost(r.meltMult);
    case 'shatter':
      return amount * boost(r.shatterMult);
    case 'overload': {
      const blast = amount * r.overloadMult * n * catalyst;
```

and further down `      const hit = amount * r.combustMult * catalyst;` becomes `      const hit = amount * boost(r.combustMult);`, and `      const hit = amount * r.crystallizeMult * catalyst;` becomes `      const hit = amount * boost(r.crystallizeMult);`. (Soulfire keeps `amount * catalyst`; Crystallize's neighbour chill stays one `applyStatus` each, `stacks.tick`.)

In `hitMonster`: `    amount = react(ctx, m, reaction, amount, opts.slot);` becomes `    amount = react(ctx, m, reaction, amount, opts.slot, pair.n);`.

In `src/types/delve.ts`, `DelveBalance.reactions`: above `    meltMult: number;` add `    /** Melt, Shatter, Combust, Crystallize: the hit × (1 + (mult − 1) × pairs × Catalyst). */`, above `    overloadMult: number;` add `    /** Overload's blast: the hit × this × pairs × Catalyst. */`, and the Crystallize line (Task 2's)

```ts
    /** Crystallize: the hit × this, and `stacks.tick` frost stacks on foes within `crystallizeRadius`. */
```

becomes

```ts
    /** Crystallize: per pair as `meltMult`, and `stacks.tick` frost stacks on foes within `crystallizeRadius`. */
```

- [ ] **Step 4: The texts**

In `src/data/arpg.json` (hand-edit; nothing tests these strings):
- Surge: `"text": "For 6 s: +30% attack speed, +20% move speed, and basic hits always apply the element's status."` → `"text": "For 6 s: +30% attack speed, +20% move speed, and basic hits also apply the element's stacks."`
- fire: `"text": "Burns, and blasts 30% wider.",` → `"text": "Burns, hotter with every stack, and blasts 30% wider.",`
- frost: `"text": "Chills; chill twice to freeze.",` → `"text": "Chills, slower with every stack; 3 stacks freeze.",`
- storm: `"text": "Shocks, and hits jump to 1 more foe.",` → `"text": "Shocks: more damage taken with every stack; hits jump to 1 more foe.",`
- shadow: `"text": "Hexes, and heals you for 8% of the damage.",` → `"text": "Hexes: more damage taken with every stack; heals you for 8% of the damage.",`

(Earth's and Nature's lines stay: "Staggers, pierces and knocks back." and "Poisons; poison stacks up to 5." are still true.)

- [ ] **Step 5: Run to verify**

Run: `(cd packages/engine && npx vitest run tests/delve-stacks.test.ts tests/delve-reactions.test.ts && npx tsc --noEmit -p .)`
Expected: 111 PASS (47 and 64); no type errors.

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: 73 files, 1200 tests, all green, the pacing rails included (Task 6 reads their numbers); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/combat.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts
git add packages/engine/src/arpg/combat.ts packages/engine/src/types/delve.ts packages/engine/src/data/arpg.json packages/engine/tests/delve-stacks.test.ts packages/engine/tests/delve-reactions.test.ts
git commit -m "feat(engine): damage reactions take and scale with every pair, effects take one; element texts say stacks" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 5: Engine: the gate

### Task 6: The gate

Measure the finished engine against the spec's pacing rails and the DPS Lab's hard gates, and print the report the balance review reads, on the build the client will use. Nothing here changes the repo: if a rail or a hard gate fails, the plan stops for the controller's decision. The sim is deterministic, so every number below is what this plan's code gives; a different number means the code differs from the plan.

**Files:**
- Build: `packages/engine/dist/` (not tracked)
- Scratch (never committed): `<before>/after-seeds40.json` and `<before>/after-depth10.json`, which the scripts write

- [ ] **Step 1: Build the engine**

Run: `(cd packages/engine && pnpm build)`
Expected: tsup's "ESM ⚡️ Build success", "CJS ⚡️ Build success" and "DTS ⚡️ Build success".

The client now reads the new `StatusState` from this build, so `(cd packages/client && npx tsc --noEmit -p .)` fails until Task 7, on the removed `StatusState` fields in `ArenaRenderer.ts` (lines 782 and 784) and `draw-world.ts` (lines 401–440); `reactions.test.ts`'s fake status is cast, so it compiles. Don't run the client here.

- [ ] **Step 2: The pacing rails**

Task 5 ran them green. Read their numbers:

Run: `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/pacing.mjs packages/engine/dist/index.js)`
Expected (about 10 s):

```
first dive: 11, 11, 11, 3 (each ≥ 3), mean 9 (4–12)
dive 6 mean 31, dive 12 mean 41 (> dive 1 + 5, > dive 6)
frost: dive 1 7.5, dive 12 29 (≥ dive 1 + 5)
legendaries owned at dive 12: 6.75 (≥ 1, < 12)
own pair's reaction found: 6 of 6
sweep at dive 6: median 29, 22–40 (allowed 17.4–46.4): fire+frost 29, earth+frost 40, storm+fire 32, frost+storm 25, fire+shadow 35, fire+nature 26, shadow+nature 22, fire+earth 26, storm+earth 32, earth+shadow 32, earth+nature 28, frost+shadow 29, frost+nature 22, storm+shadow 35, storm+nature 28
seconds per floor: 30.76 (8–60)
```

(HEAD for comparison: first dives 11, 11, 11, 12, mean 11.25; dive 6 31.75, dive 12 37.75; Frost 7.5 → 33; 6.25 legendaries; 6 of 6; sweep median 28, 22–41; 25.75 s a floor.) The tight rail is seed 4's first dive, which ends at depth 3, the floor.

If a rail fails, or a number differs from these, **stop and report it**; don't retune. (For the controller's decision: the spec's tuning order is the per-stack values, then `reactionLockout`, 2 s at most, then `freezeAt`, then `basicFinisher`, 3 at most, then `cap`/`duration`, and nothing outside `delve.stacks` without asking.)

- [ ] **Step 3: The DPS Lab before/after**

`<before>` must hold `before-depth10.json` and `before-seeds40.json` (made from the pre-stacks engine; if they are gone, stop and report: they can't be remade after Task 2; Task 1 checked them). If `seeds40.mjs`, `gate.mjs` or `pacing.mjs` is missing, write it from the texts at the end of this task.

Run: `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/seeds40.mjs packages/engine/dist/index.js /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/after-seeds40.json)`
Expected (about 20 s): `setups 1224` (every basic attack, one dummy and the pack, and every single-element ability, one dummy).

Run: `(node /c/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad/stacks-before/gate.mjs packages/engine/dist/index.js)`
Expected (it re-runs the whole DPS Lab grid, 9,144 setups: about 10 s, longer on a busy machine; slow isn't failing):

```
Hard gates
H1 single-element basics, one dummy: worst frost sword -0.6% (floor −15%): pass
H2 Balanced mana Bolt, Burst, Nova, one dummy: worst bolt frost -0.1% (floor −15%): pass
   bolt fire +4.9%, bolt frost -0.1%, bolt storm +6.1%, bolt earth -0.1%, bolt shadow +4.8%, bolt nature +6.2%, burst fire +5.6%, burst frost +0.3%, burst storm +6.7%, burst earth +0.3%, burst shadow +5.3%, burst nature +7.0%, nova fire +155.1%, nova frost +0.6%, nova storm +6.1%, nova earth +0.6%, nova shadow +4.0%, nova nature +145.9%
H3 Nature+Fire Burst, pack, after ÷ before: at most ×1.31 (under ×2): pass
H4 best fused ÷ best single-element Burst, one dummy: ×2.45 → ×2.62 (+7.1%; at most +10%): pass
   before nature frost 2 cast 281.96 ÷ nature none 2 cast 115.22; after frost fire 2 mana 322.97 ÷ nature none 2 cast 123.18
Report (40-seed means unless marked)
R1 single-element basics by weapon (dagger, sword, axe, maul, staff, wand, bow), one dummy | pack:
   fire   +17.4% +22.0% +33.7% +49.1% +24.7% +10.6% +24.5% | +17.4% +44.1% +39.9% +38.5% +24.7% +10.6% +26.6%
   frost  +0.0% -0.6% -0.5% +0.1% -0.3% -0.3% -0.5% | +0.0% -1.4% -0.0% +0.1% -0.3% -0.3% +0.2%
   storm  +8.0% +9.7% +11.5% +14.4% +10.0% +7.6% +9.5% | +8.0% +13.1% +12.4% +15.2% +10.0% +7.6% +10.2%
   earth  +0.0% -0.6% -0.5% +0.1% -0.3% -0.3% -0.5% | +0.0% -1.4% -0.0% +0.1% -0.3% -0.3% +0.2%
   shadow +5.5% +5.6% +6.5% +9.3% +6.2% +5.1% +5.6% | +5.5% +7.5% +7.4% +10.5% +6.2% +5.1% +6.3%
   nature +26.1% +41.5% +65.3% +96.7% +46.1% +17.8% +42.2% | +26.1% +91.0% +78.3% +124.6% +46.1% +17.8% +47.0%
R2 pair basics (both orders, every weapon), median [min, max], one dummy | pack:
   fire+frost    +19.5% [-15.6%, +31.2%] | +14.7% [-14.6%, +34.7%]
   fire+storm    -3.9% [-12.5%, +11.7%] | +45.5% [-22.3%, +69.4%]
   fire+earth    +18.0% [-4.9%, +33.1%] | +14.3% [-13.6%, +41.5%]
   fire+shadow   -6.3% [-31.4%, +14.8%] | -5.0% [-29.9%, +14.6%]
   fire+nature   +15.4% [-11.5%, +47.3%] | +20.5% [-20.7%, +35.8%]
   frost+storm   +6.0% [-3.2%, +16.7%] | +6.0% [-1.6%, +16.7%]
   frost+earth   +54.2% [+0.2%, +108.8%] | +33.1% [+0.6%, +73.5%]
   frost+shadow  +8.0% [-2.1%, +12.1%] | +5.6% [+0.4%, +10.2%]
   frost+nature  +21.0% [-9.5%, +50.6%] | +15.3% [-18.4%, +43.1%]
   storm+earth   +11.4% [-3.1%, +16.0%] | +8.9% [+1.0%, +15.1%]
   storm+shadow  +7.4% [+0.1%, +29.7%] | +6.8% [+3.6%, +29.7%]
   storm+nature  +76.6% [+8.7%, +84.1%] | +57.5% [+15.7%, +90.3%]
   earth+shadow  +4.8% [-2.0%, +13.0%] | +4.9% [-0.9%, +13.0%]
   earth+nature  +46.8% [-0.4%, +85.6%] | +34.8% [+8.7%, +83.4%]
   shadow+nature +2.8% [-42.0%, +35.8%] | +18.6% [-51.4%, +66.7%]
R3 basics top 30, one dummy: 7 pairs → 7; in: storm+nature, earth+nature; out: fire+shadow, fire+storm
R3 basics top 30, pack: 10 pairs → 7; in: none; out: fire+shadow, fire+earth, frost+earth
R4 single-element abilities, one dummy (every form, weight and payment), median [min, max]:
   fire   +3.6% [-19.8%, +335.2%]
   frost  +0.0% [-7.8%, +8.4%]
   storm  +6.5% [-8.6%, +45.5%]
   earth  +0.0% [-7.8%, +8.4%]
   shadow +4.9% [-4.8%, +24.7%]
   nature +5.1% [-18.8%, +338.0%]
R5 fused Bursts, one dummy (one seed), best over order, weight and payment, before → after:
   fire+frost 127.7 → 322.97 (+152.9%), fire+storm 97.36 → 101.81 (+4.6%), fire+earth 160.71 → 164.35 (+2.3%), fire+shadow 111.02 → 122.86 (+10.7%), fire+nature 256.59 → 211.04 (-17.8%), frost+storm 70.86 → 74.38 (+5.0%), frost+earth 111.49 → 301.75 (+170.7%), frost+shadow 86.28 → 90.64 (+5.1%), frost+nature 281.96 → 196.12 (-30.4%), storm+earth 70.86 → 74.5 (+5.1%), storm+shadow 73.58 → 88.82 (+20.7%), storm+nature 127.13 → 156.5 (+23.1%), earth+shadow 92.92 → 96.38 (+3.7%), earth+nature 112.48 → 119.75 (+6.5%), shadow+nature 138.15 → 157.88 (+14.3%)
```

How to read it. The four hard gates (the spec's DPS Lab section) must pass; everything under Report is for the balance review, not tuned to:
- **H1:** no single-element basic, any weapon, one dummy, loses more than 15% (40-seed means). The worst is the Frost sword, −0.6%.
- **H2:** no single-element Balanced mana Bolt, Burst or Nova, one dummy, loses more than 15% (40-seed means). The worst is the Frost Bolt, −0.1%.
- **H3:** a Nature+Fire Burst against the pack stays under twice its pre-stacks figure (one seed, every weight and payment): at most ×1.31.
- **H4:** the best fused Burst's ratio to the best single-element Burst, one dummy, grows by 10% at most: ×2.45 → ×2.62. The best fused Burst is now the Frost+Fire one (Steam, Melting two or three pairs a hit); `poisonPerStack` 1.7 keeps the Nature Burst the best single-element one.
- **R1–R5:** the per-weapon single-element basics (one dummy | pack); every pair's basics, median and range over both orders and every weapon; the pairs moving in or out of the basics' top 30; single-element abilities by element; and the best fused Burst of each pair.

**Stop rule.** If a hard gate fails or the numbers differ from these, stop and report them before going on. (Task 9 writes the shifts into the spec's status line.)

- [ ] **Step 4: Restart the dev server**

The client reads the rebuilt engine; restart Vite so it doesn't serve the stale bundle. Run the PowerShell block under "Dev server on 5288" in the header.
Expected: `True`.

No commit: this task changes nothing in the repo.

**The scripts' texts** (for `<before>` only; never in the repo):

`seeds40.mjs`:

```js
// 40-seed mean DPS, depth 10: every basic-attack setup (one dummy and the pack) and every
// single-element ability (one dummy), by simulateDps's loop with the world's rng reseeded.
// Crits (and, before the stacks, the basics' 30% status roll) make one seed a noisy figure.
// Usage: node seeds40.mjs <engine dist/index.js> <out.json>
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const E = await import(pathToFileURL(process.argv[2]).href);
const reg = E.createDefaultRegistry();
const SEEDS = 40;
const hyp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function sim(setup, pack, seed) {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = E.sandboxWeapon(reg, { baseId, mana: primary, rarity: 'common', ilvl: 10 });
  const world = E.createSandboxWorld(reg, {
    depth: 10,
    stats: E.computeHeroStats({ weapon }, reg, { pair: { primary, secondary } }),
    abilities: setup.abilities,
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
  const input =
    slot === null
      ? { move: { x: 0, y: 0 }, attack: true, attackAim: aim }
      : { move: { x: 0, y: 0 }, cast: { slot, aim } };
  const step = reg.getDelveBalance().arena.step;
  let damage = 0;
  for (let i = 0; i < Math.round(E.DPS_SECONDS / step); i++) {
    for (const e of E.stepWorld(reg, world, input, step))
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

const out = {};
const combos = E.dpsCombos(reg);
const runs = [
  ...combos
    .filter((s) => s.view === 'basic')
    .flatMap((s) => [
      [s, false],
      [s, true],
    ]),
  ...combos.filter((s) => s.view === 'ability' && s.dims.second === 'none').map((s) => [s, false]),
];
for (const [s, pack] of runs) {
  let sum = 0;
  for (let seed = 1; seed <= SEEDS; seed++) sum += sim(s, pack, seed);
  out[`10|${pack}|${E.dpsKey(s)}`] = +(sum / SEEDS).toFixed(2);
}
writeFileSync(process.argv[3], JSON.stringify(out));
console.log('setups', Object.keys(out).length);
```

`gate.mjs`:

```js
// The stacks spec's DPS Lab gate at depth 10: the hard regression gates, then the report.
// Reads before-depth10.json and before-seeds40.json (the pre-stacks engine) and after-seeds40.json
// (seeds40.mjs on the new engine) from this folder; runs the grid and writes after-depth10.json.
// Usage: node gate.mjs <engine dist/index.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const E = await import(pathToFileURL(process.argv[2]).href);
const here = (f) => new URL(f, import.meta.url);
const json = (f) => JSON.parse(readFileSync(here(f), 'utf8'));
const before = json('before-depth10.json');
const s0 = json('before-seeds40.json');
const s1 = json('after-seeds40.json');

const reg = E.createDefaultRegistry();
const after = {};
for (const pack of [false, true])
  for (const s of E.dpsCombos(reg)) {
    const r = E.simulateDps(reg, s, { depth: 10, pack });
    after[`10|${pack}|${E.dpsKey(s)}`] = { dps: +r.dps.toFixed(2), view: s.view, dims: s.dims };
  }
writeFileSync(here('after-depth10.json'), JSON.stringify(after));

const pct = (x) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;
const shift = (k) => s1[k] / s0[k] - 1; // 40-seed means
const gridShift = (k) => after[k].dps / before[k].dps - 1;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const span = (xs) => `${pct(median(xs))} [${pct(Math.min(...xs))}, ${pct(Math.max(...xs))}]`;
const verdict = (ok) => (ok ? 'pass' : 'FAIL');
const WEAPONS = [
  ...new Set(
    Object.keys(s0)
      .map((k) => k.split('|'))
      .filter((p) => p[2] === 'basic')
      .map((p) => p[3]),
  ),
];
const basic = (pack, w, p, q) => `10|${pack}|basic|${w}|${p}|${q}`;

console.log('Hard gates');
// H1. No single-element basic, any weapon, one dummy, loses more than 15%.
const h1 = E.MANA_TYPES.flatMap((e) =>
  WEAPONS.map((w) => [`${e} ${w}`, shift(basic(false, w, e, 'none'))]),
);
const h1Worst = h1.reduce((a, b) => (b[1] < a[1] ? b : a));
console.log(
  `H1 single-element basics, one dummy: worst ${h1Worst[0]} ${pct(h1Worst[1])} (floor −15%): ${verdict(h1Worst[1] >= -0.15)}`,
);
// H2. No single-element Balanced mana Bolt, Burst or Nova, one dummy, loses more than 15%.
const h2 = ['bolt', 'burst', 'nova'].flatMap((f) =>
  E.MANA_TYPES.map((e) => [`${f} ${e}`, shift(`10|false|ability|${f}|${e}|none|0|mana`)]),
);
const h2Worst = h2.reduce((a, b) => (b[1] < a[1] ? b : a));
console.log(
  `H2 Balanced mana Bolt, Burst, Nova, one dummy: worst ${h2Worst[0]} ${pct(h2Worst[1])} (floor −15%): ${verdict(h2Worst[1] >= -0.15)}`,
);
console.log(`   ${h2.map(([n, x]) => `${n} ${pct(x)}`).join(', ')}`);
// H3. A Nature+Fire Burst against the pack stays under twice its pre-stacks figure.
const nf = Object.keys(after).filter((k) => k.startsWith('10|true|ability|burst|nature|fire|'));
const nfMax = Math.max(...nf.map((k) => 1 + gridShift(k)));
console.log(
  `H3 Nature+Fire Burst, pack, after ÷ before: at most ×${nfMax.toFixed(2)} (under ×2): ${verdict(nfMax < 2)}`,
);
// H4. The best fused Burst's ratio to the best single-element Burst, one dummy, grows 10% at most.
const burstRatio = (grid) => {
  const bursts = Object.entries(grid).filter(
    ([k, v]) => k.startsWith('10|false|') && v.dims.form === 'burst',
  );
  const best = (xs) => xs.reduce((a, b) => (b[1].dps > a[1].dps ? b : a));
  const [fk, fv] = best(bursts.filter(([, v]) => v.dims.second !== 'none'));
  const [sk, sv] = best(bursts.filter(([, v]) => v.dims.second === 'none'));
  const name = (k) => k.split('|').slice(4).join(' ');
  return [fv.dps / sv.dps, `${name(fk)} ${fv.dps} ÷ ${name(sk)} ${sv.dps}`];
};
const [[r0, t0], [r1, t1]] = [burstRatio(before), burstRatio(after)];
console.log(
  `H4 best fused ÷ best single-element Burst, one dummy: ×${r0.toFixed(2)} → ×${r1.toFixed(2)} (${pct(r1 / r0 - 1)}; at most +10%): ${verdict(r1 / r0 - 1 <= 0.1)}`,
);
console.log(`   before ${t0}; after ${t1}`);

console.log('Report (40-seed means unless marked)');
console.log(`R1 single-element basics by weapon (${WEAPONS.join(', ')}), one dummy | pack:`);
for (const e of E.MANA_TYPES)
  console.log(
    `   ${e.padEnd(6)} ${[false, true].map((p) => WEAPONS.map((w) => pct(shift(basic(p, w, e, 'none')))).join(' ')).join(' | ')}`,
  );
console.log('R2 pair basics (both orders, every weapon), median [min, max], one dummy | pack:');
const pairs = E.MANA_TYPES.flatMap((a, i) => E.MANA_TYPES.slice(i + 1).map((b) => [a, b]));
for (const [a, b] of pairs) {
  const xs = (p) => WEAPONS.flatMap((w) => [shift(basic(p, w, a, b)), shift(basic(p, w, b, a))]);
  console.log(`   ${`${a}+${b}`.padEnd(13)} ${span(xs(false))} | ${span(xs(true))}`);
}
for (const pack of [false, true]) {
  const top = (s) =>
    new Set(
      Object.keys(s)
        .filter((k) => k.startsWith(`10|${pack}|basic|`))
        .sort((x, y) => s[y] - s[x])
        .slice(0, 30)
        .map((k) => k.split('|').slice(4))
        .filter(([, q]) => q !== 'none')
        .map((pq) =>
          pq.sort((x, y) => E.MANA_TYPES.indexOf(x) - E.MANA_TYPES.indexOf(y)).join('+'),
        ),
    );
  const [was, now] = [top(s0), top(s1)];
  const into = [...now].filter((p) => !was.has(p));
  const outOf = [...was].filter((p) => !now.has(p));
  console.log(
    `R3 basics top 30, ${pack ? 'pack' : 'one dummy'}: ${was.size} pairs → ${now.size}; in: ${into.join(', ') || 'none'}; out: ${outOf.join(', ') || 'none'}`,
  );
}
console.log(
  'R4 single-element abilities, one dummy (every form, weight and payment), median [min, max]:',
);
for (const e of E.MANA_TYPES) {
  const keys = Object.keys(s0).filter(
    (k) => k.startsWith('10|false|ability|') && k.split('|')[4] === e && s0[k] > 0,
  );
  console.log(`   ${e.padEnd(6)} ${span(keys.map(shift))}`);
}
console.log(
  'R5 fused Bursts, one dummy (one seed), best over order, weight and payment, before → after:',
);
const fused = (grid, a, b) =>
  Math.max(
    ...Object.entries(grid)
      .filter(([k, v]) => k.startsWith('10|false|') && v.dims.form === 'burst')
      .filter(([, v]) => [v.dims.first, v.dims.second].sort().join('+') === [a, b].sort().join('+'))
      .map(([, v]) => v.dps),
  );
console.log(
  `   ${pairs.map(([a, b]) => `${a}+${b} ${fused(before, a, b)} → ${fused(after, a, b)} (${pct(fused(after, a, b) / fused(before, a, b) - 1)})`).join(', ')}`,
);
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

`snapshot.mjs` (the before grid; only Task 1 runs it, on HEAD):

```js
// The DPS Lab grid at HEAD before elemental stacks: the "before" half of the spec's check.
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

---

## Chunk 6: Client

### Task 7: Pips, the ×n label, the meter and the texts

The client only draws what the engine now says. Under each foe, a row of pips per stacked element (in `MANA_TYPES` order, one pip a stack, five at most), on a dark plate so it reads on any floor; they replace the hex motes, the shock ring, the poison dust and the rattle chips (the frost tint, burn flicker, freeze dust, stagger, brand, Sunder, blind and root marks stay). A reaction that took more than one pair floats "MELT! ×2" (the `hit` event's `pairs`; only damage reactions take more than one, and Soulfrost's execute pseudo-hit has none and keeps its plain label). The Training meter's reaction counts sum the pairs. Two texts say stacks. The engine build from Task 6 is what the client imports (`@alloy/engine` resolves to `packages/engine/dist`), so rebuild it first if the engine changed since.

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/reactions.ts:20-23` (`reactionLabel`)
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts:304` (the label), `:782-784` (the tint)
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts:2`, `:18`, `:31`, `:382-447` (`drawMonsterMarks`)
- Modify: `packages/client/src/features/delve/training/meter.ts:35`, `:70`
- Modify: `packages/client/src/features/delve/training/MeterView.tsx:97-99`
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx:489`
- Modify: `packages/client/src/features/delve/ManaChoice.tsx:67`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts`, `packages/client/src/features/delve/__tests__/training-meter.test.ts`, `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/features/delve/arena/fx/__tests__/reactions.test.ts`:

1. In `describe('reaction labels', …)`, after the test `'come from the data, so a new reaction never floats "undefined"'` add

```ts

  it('say how many pairs a reaction took, when it took more than one', () => {
    expect(reactionLabel('melt', 1)).toBe('MELT!');
    expect(reactionLabel('melt', 2)).toBe('MELT! ×2');
  });
```

2. In `describe('lasting states', …)`, above `  /** A plain foe's mark pixels at t = 1, both layers. */` add

```ts
  const NO_STACKS = { fire: 0, frost: 0, storm: 0, earth: 0, shadow: 0, nature: 0 };

```

and in `markPixels`' fake status the lines

```ts
        rootUntil: 0,
        hexUntil: 0,
        shockUntil: 0,
        freezeUntil: 0,
        poisonUntil: 0,
        poisonStacks: 0,
        staggerUntil: 0,
        brandUntil: 0,
        rattledUntil: 0,
        sunderUntil: 0,
```

become

```ts
        stacks: NO_STACKS,
        rootUntil: 0,
        freezeUntil: 0,
        staggerUntil: 0,
        brandUntil: 0,
        sunderUntil: 0,
```

3. The test

```ts
  it('rattled, sundered and blinded foes wear their marks only while they last', () => {
    expect(markPixels({})).toBe(0);
    for (const key of ['rattledUntil', 'sunderUntil', 'blindUntil']) {
```

begins instead

```ts
  it('sundered and blinded foes wear their marks only while they last', () => {
    expect(markPixels({})).toBe(0);
    for (const key of ['sunderUntil', 'blindUntil']) {
```

and after it (the last test in the file) add

```ts

  it('a foe wears a pip per stack on a plate per stacked element, five pips at most', () => {
    expect(markPixels({ stacks: { ...NO_STACKS, fire: 3 } })).toBe(1 + 3);
    expect(markPixels({ stacks: { ...NO_STACKS, fire: 3, earth: 2 } })).toBe(1 + 3 + 1 + 2);
    expect(markPixels({ stacks: { ...NO_STACKS, nature: 10 } })).toBe(1 + 5);
  });
```

(`markPixels` counts `rect` calls on both layers: a plate is one, a pip one. Ten Nature stacks, a Plaguebearer's, still draw five.)

In `src/features/delve/__tests__/training-meter.test.ts`: `const melt: ArpgEvent = { kind: 'reaction', reaction: 'melt', x: 0, y: 0 };` becomes

```ts
const melt = (pairs: number): ArpgEvent => ({
  kind: 'reaction',
  reaction: 'melt',
  x: 0,
  y: 0,
  pairs,
});
```

and then: the title `'buckets hits by source and ability slot, and counts reactions by name'` becomes `'buckets hits by source and ability slot, and counts reactions by name, a pair at a time'`; in its `record` list the two lines `        melt,` become `        melt(1),` and `        melt(3),`; `    expect(s.reactions).toEqual({ melt: 2 });` becomes `    expect(s.reactions).toEqual({ melt: 4 });`; and in "reset starts over", `    m.record([hit(100, 'basic'), melt], 1);` becomes `    m.record([hit(100, 'basic'), melt(1)], 1);`.

In `src/features/delve/__tests__/AbilitiesPanel.test.tsx`: after `    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(14);` add

```ts
    expect(screen.getAllByTestId('reaction-unknown')[0]).toHaveTextContent(
      'Stack one element on a foe, then hit it with another, to discover.',
    );
```

In `src/pages/__tests__/DelveCamp.test.tsx`: `    expect(storm).toHaveTextContent('Shock');` becomes `    expect(storm).toHaveTextContent('Every blow applies a stack of Storm: Shock');`.

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts src/features/delve/__tests__/training-meter.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: 5 FAIL, 20 PASS: "expected 'MELT!' to be 'MELT! ×2'", "expected +0 to be 4" (no pips), "expected { melt: 2 } to deeply equal { melt: 4 }", and two "Expected element to have text content" (the hint and the Anvil's mana choice).

- [ ] **Step 3: The label and the meter**

In `src/features/delve/arena/fx/reactions.ts`, the function

```ts
/** A reaction's floating label: its name from arpg.json, shouted. */
export function reactionLabel(id: ReactionId): string {
  return `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
}
```

becomes

```ts
/** A reaction's floating label: its name from arpg.json, shouted, with ×n when it took n pairs. */
export function reactionLabel(id: ReactionId, pairs = 1): string {
  const label = `${getDelveRegistry().getReaction(id).name.toUpperCase()}!`;
  return pairs > 1 ? `${label} ×${pairs}` : label;
}
```

In `src/features/delve/arena/ArenaRenderer.ts` (the `hit` event's reaction text): `              reactionLabel(e.reaction),` becomes `              reactionLabel(e.reaction, e.pairs),`.

In `src/features/delve/training/meter.ts`: `  /** Reactions set off, by name. */` becomes `  /** Reactions set off, by name: the pairs of stacks each consumed, summed. */`, and

```ts
      if (e.kind === 'reaction') this.reactions[e.reaction] = (this.reactions[e.reaction] ?? 0) + 1;
```

becomes

```ts
      if (e.kind === 'reaction')
        this.reactions[e.reaction] = (this.reactions[e.reaction] ?? 0) + (e.pairs ?? 1);
```

In `src/features/delve/training/MeterView.tsx`, the note

```tsx
        Melt, Shatter, Soulfire, Combust and Crystallize multiply the hit that set them off, so
        their damage stays in that hit&apos;s row; Sunder&apos;s bonus shows in later hits&apos;
        rows. Time is the fight&apos;s own, so slow motion doesn&apos;t change the DPS.
```

becomes

```tsx
        Each reaction counts the pairs of stacks it used up. Melt, Shatter, Soulfire, Combust and
        Crystallize multiply the hit that set them off, so their damage stays in that hit&apos;s
        row; Sunder&apos;s bonus shows in later hits&apos; rows. Time is the fight&apos;s own, so
        slow motion doesn&apos;t change the DPS.
```

- [ ] **Step 4: The pips and the tint**

In `src/features/delve/arena/fx/draw-world.ts`:

1. `import type { ArpgWorld, ManaType, Projectile, Vec, Zone } from '@alloy/engine';` becomes

```ts
import {
  MANA_TYPES,
  type ArpgWorld,
  type ManaType,
  type Projectile,
  type Vec,
  type Zone,
} from '@alloy/engine';
```

2. In the `'./mana-pixels'` import, after `  px,` add `  snap,`.
3. After `const BLIND_SMOKE = 0x9a8cc4;` add

```ts
/** Pips in a stack row: the cap (Plaguebearer's extra Nature stacks don't widen it). */
const MAX_PIPS = 5;
```

4. `drawMonsterMarks`' comment

```ts
/**
 * Elite and boss rings (ground), and status marks (air): hex, shock, frost,
 * poison, stagger, brand, and the reactions' rattle, Sunder and blind.
 */
```

becomes

```ts
/**
 * Elite and boss rings and stack pips (ground), and status marks (air): frost,
 * stagger, brand, and the reactions' Sunder and blind.
 */
```

5. In its loop, the hex motes and the shock ring, from `    if (t < s.hexUntil)` through the closing `    }` of `    if (t < s.shockUntil) {` (the 21 lines above `    if (t < s.freezeUntil) manaDust(…`), become

```ts
    // Stacks: under the foe, a row per stacked element (in element order), one pip a stack, on a
    // dark plate so they read on any floor.
    let top = m.y + m.radius + 0.1;
    for (const e of MANA_TYPES) {
      const n = Math.min(MAX_PIPS, s.stacks[e]);
      if (n <= 0) continue;
      const left = m.x - (n + 0.5) * PX;
      ground.rect(snap(left), snap(top), (2 * n + 1) * PX, 3 * PX).fill({ color: 0, alpha: 0.6 });
      for (let i = 0; i < n; i++) px(ground, left + (2 * i + 1) * PX, top + PX, MANA_HEX[e], 1);
      top += 3 * PX;
    }
```

6. Delete the poison dust, the 13 lines from `    if (t < s.poisonUntil && s.poisonStacks > 0) {` through its closing `    }` (above `    if (t < s.staggerUntil && t >= s.freezeUntil) {`), and the rattle chips, the 8 lines from `    if (t < s.rattledUntil) {` through its closing `    }` (above `    if (t < s.sunderUntil)`).

(A plate is `2n + 1` sprite pixels wide and 3 tall, centred under the foe's feet; the pips sit on its middle row with a dark pixel between them. Both go on the ground layer: the air layer only adds light, so it can't draw the dark plate, and 1-pixel pips without one vanish on bright floors such as lava.)

In `src/features/delve/arena/ArenaRenderer.ts`, the sprite tint's

```ts
        : t < s.chillUntil
          ? 0xc8ecff
          : t < s.burnUntil && Math.sin(this.time * 20) > 0
```

becomes

```ts
        : s.stacks.frost > 0
          ? 0xc8ecff
          : s.stacks.fire > 0 && Math.sin(this.time * 20) > 0
```

- [ ] **Step 5: The texts**

In `src/features/delve/AbilitiesPanel.tsx`, the undiscovered reaction's hint `                    {seen ? r.text : 'Hit one foe with two different elements to discover.'}` becomes

```tsx
                    {seen
                      ? r.text
                      : 'Stack one element on a foe, then hit it with another, to discover.'}
```

In `src/features/delve/ManaChoice.tsx`: `                  Basic status: {title(BASIC_STATUS[m])}` becomes `                  Every blow applies a stack of {st.name}: {title(BASIC_STATUS[m])}` (`st` is the element's style, already in scope: "Every blow applies a stack of Storm: Shock").

- [ ] **Step 6: Run to verify**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts src/features/delve/__tests__/training-meter.test.ts src/features/delve/__tests__/AbilitiesPanel.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: 25 PASS.

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 88 files, 653 tests, all green (651 before this task).

No E2E spec reads a status or these texts: `(cd packages/client && grep -rn "Basic status\|Hit one foe\|reaction-unknown" e2e)` prints only `delve.spec.ts`' D04 count of 15 `reaction-unknown` rows, which still holds. Task 9 runs the Delve E2E specs.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/training/meter.ts packages/client/src/features/delve/training/MeterView.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/ManaChoice.tsx packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/training-meter.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git add packages/client/src/features/delve/arena/fx/reactions.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/training/meter.ts packages/client/src/features/delve/training/MeterView.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/ManaChoice.tsx packages/client/src/features/delve/arena/fx/__tests__/reactions.test.ts packages/client/src/features/delve/__tests__/training-meter.test.ts packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): stack pips under foes, MELT! ×n, and the meter counts pairs" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 7: Release

### Task 8: Look at it

The unit tests count pixels; look at the pips and the label in the running game.

**Files:**
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/stacks-shots.spec.ts`

- [ ] **Step 1: The screenshot pass**

Create the scratch config (header). The 5288 dev server must be running with the new engine (Task 6 restarted it; run the header block again if in doubt; expect `True`).

Create `packages/client/e2e/stacks-shots.spec.ts` (scratch: never committed):

```ts
import { test, expect } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile, defaultAbilities } from '@alloy/engine';

/**
 * SCRATCH (elemental stacks plan, Task 8): never committed. Stacks pips on a Training Grounds
 * dummy with a Steam Bolt (Fire + Frost, Balanced: two stacks of each a hit), then Melts two
 * pairs, and saves screenshots to SHOTS_DIR (a folder in your scratchpad, never the repo).
 */
const OUT = process.env.SHOTS_DIR;
if (!OUT) throw new Error('Set SHOTS_DIR to a folder in your scratchpad');

test('stacks shots', async ({ page }, info) => {
  const name = info.project.name;
  const shot = (what: string) => page.screenshot({ path: `${OUT}/${name}-${what}.png` });
  const save = JSON.stringify(
    createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' }),
  );
  const sandbox = JSON.stringify({
    abilities: {
      ...defaultAbilities('fire'),
      primary: { form: 'bolt', elements: ['fire', 'frost'], weight: 0, payment: 'mana' },
    },
    dummies: [{ layout: 'single', element: null }],
  });
  await page.addInitScript(
    ([s, sb]) => {
      if (sessionStorage.getItem('stacks-shots')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:v2', s);
      localStorage.setItem('alloy:delve:sandbox:v1', sb);
      localStorage.setItem('alloy:delve:manualAttack', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('stacks-shots', '1');
    },
    [save, sandbox],
  );
  await page.goto('/delve/training');
  const ability0 = page.getByTestId('ability-0');
  await expect(ability0).toBeVisible({ timeout: 30_000 });
  const panel = page.getByTestId('training-panel');
  if ((await panel.isVisible()) && (await panel.getAttribute('data-layout')) === 'sheet')
    await page.getByTestId('training-panel-close').click();

  // One hit: two fire and two frost pips.
  await ability0.click();
  await page.waitForTimeout(700);
  await shot('pips');
  // The next hit pairs its fire with those two frost: MELT! ×2.
  await page.waitForTimeout(700);
  await ability0.click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    await shot(`melt-${i}`);
  }
});
```

(The Training Grounds with a Balanced Fire + Frost Bolt, Steam: each hit applies two fire and two frost stacks. The first hit sets up, and nothing reacts, so no lockout starts; the second pairs its fire with the two frost: Melt, two pairs.)

Run, with `<scratchpad>` your session's scratchpad directory (forward slashes): `(cd packages/client && SHOTS_DIR="<scratchpad>/stacks-shots" npx playwright test -c playwright.scratch.config.ts --project=desktop e2e/stacks-shots.spec.ts)`
Expected: 1 passed; `desktop-pips.png` and `desktop-melt-0.png` … `desktop-melt-3.png` in `<scratchpad>/stacks-shots/`, none in the repo.

- [ ] **Step 2: Look at them**

The pips are sprite pixels (0.1 units), so crop and enlarge around the dummy first. Save this as `<scratchpad>/crop.cjs` (it borrows `pngjs` from pixel-forge):

```js
// Crop and upscale a PNG: node crop.cjs <in> <out> <x> <y> <w> <h> <scale>
const { PNG } = require('C:/Projects/Alloy/packages/pixel-forge/node_modules/pngjs');
const fs = require('fs');
const [inp, out, x, y, w, h, k] = process.argv.slice(2).map((v, i) => (i < 2 ? v : Number(v)));
const src = PNG.sync.read(fs.readFileSync(inp));
const dst = new PNG({ width: w * k, height: h * k });
for (let j = 0; j < h * k; j++)
  for (let i = 0; i < w * k; i++) {
    const si = ((y + Math.floor(j / k)) * src.width + (x + Math.floor(i / k))) * 4;
    const di = (j * w * k + i) * 4;
    for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c];
  }
fs.writeFileSync(out, PNG.sync.write(dst));
```

Run: `(node <scratchpad>/crop.cjs <scratchpad>/stacks-shots/desktop-pips.png <scratchpad>/stacks-shots/zoom-pips.png 407 180 100 110 5)` and `(node <scratchpad>/crop.cjs <scratchpad>/stacks-shots/desktop-melt-1.png <scratchpad>/stacks-shots/zoom-melt.png 380 110 160 180 3)` (the dummy stands above the hero, about (457, 230) on the desktop shot; move the box if it isn't in it), then view the full shots and the crops with the Read tool and check:
- `pips`: under the training dummy's feet, two orange pips on a dark plate, and one row lower two pale-blue pips on another (fire then frost: element order). No violet hex motes, storm ring, green poison dust or circling rock chips anywhere.
- `melt-*`: in at least one frame "MELT! ×2" floats above the dummy; the pips read two and two again (the second hit's fire went on, two pairs came off, then its frost).
- The rest of the arena as before: the HUD, the meter chip, the floor.

If the pips don't read, tune only their cosmetic numbers (`MAX_PIPS` stays the cap; the plate's alpha, the row gap, the offset under the foe) in `draw-world.ts`, keep `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/reactions.test.ts)` green, and reshoot. Commit each fix:

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/draw-world.ts
git add packages/client/src/features/delve/arena/fx/draw-world.ts
git commit -m "fix(client): tune the stack pips from the screenshots" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Delete `packages/client/e2e/stacks-shots.spec.ts` when done (keep the scratch config for Task 9). Nothing to commit if nothing was tuned.

---

### Task 9: Docs, the version, and full verification

**Files:**
- Modify: `CLAUDE.md:26` (CRLF, hand-edit: the Versioning sentence), `:84` (the Pair reactions bullet)
- Modify: `docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md:4` (CRLF, hand-edit: the status line)
- Modify: `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md:22`, `:66` (CRLF, hand-edit: two superseded notes)
- Modify: `packages/client/package.json:3`

- [ ] **Step 1: Docs**

In `CLAUDE.md`, the Versioning paragraph's first two sentences (line 26)

```markdown
The client surfaces its version in the bottom TabBar as `v{version}`. Source of truth is `packages/client/package.json#version`, injected at build time via a `define` in both `vite.config.ts` and `vitest.config.ts`.
```

become (there is no `define`: `TabBar.tsx` imports the version)

```markdown
The client surfaces its version in the bottom TabBar as `v{version}`. Source of truth is `packages/client/package.json#version`, which `src/components/TabBar.tsx` imports directly.
```

and the Delve section's bullet that begins `- **Pair reactions** (spec:` (line 84, one long line) becomes this one line:

```markdown
- **Elemental stacks and pair reactions** (specs: `docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md`, over `docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md`): every hit applies **stacks** of each element status it carries (`StatusState.stacks`, 0 to `stacks.cap` per element, and one timer per element, `stackUntil`, that any new stack of it refreshes; at the timer they all lapse together, at the top of `monstersTick`). A blow applies `basicBlow`, a finisher `basicFinisher`, an ability's direct hit its weight's `byWeight` (`ResolvedAbility.stacks`), anything else `tick`; the count rides `HitOpts.stacks` (`Projectile.stacks` for shots), and `applyStatus(…, n)` maps a status to its element through `BASIC_STATUS`'s inverse (`applyStacks` in `arpg/combat.ts`). The count is the status and its strength, along a diminishing curve (`stacks.curve`, cumulative, 1 to 3.5 over five stacks; past its end each stack adds its last step; `stackIntensity`): a burn deals `burnRef × firePerStack × curve` a second and poison `poisonRef × poisonPerStack × curve`, shock and hex add `perStack × curve` damage taken, frost slows linearly per stack (capped) and freezes on *crossing* `freezeAt` (checked once per hit, `crossFreeze`), and Earth's stacks (the rattle) come only from a stagger by a source that includes Earth (`HitOpts.rattles`); `isBurning` and the rest read `stacks[el] > 0`, and `hasMark` also counts a bare freeze as frost. Every pair of elements reacts, both ways: a hit pairs its element's stacks off against the first other element, in `MANA_TYPES` order, with stacks from earlier hits (a bare freeze is one frost stack to a partner; `findPair`). A damage reaction (Melt, Shatter, Overload, Combust, Crystallize: `DAMAGE_REACTIONS`) takes every pair, the smaller count, and adds its bonus once per pair (Overload's blast grows per pair; `react(…, n)`); the other ten fire once and take one pair, so the rest of both statuses stay. `consumePairs` takes the pairs off both sides (a freeze ends when frost was the partner, except under Superconduct), and no reaction fires on that foe for `reactionLockout` (`StatusState.reactionLockUntil`); a killing reaction consumes nothing. The table is `arpg.json → reactions` (`elements`, `cooldown`; `registry.getReactionFor(a, b)`), checked by one `ReactionIdSchema` that the save's `reactionsSeen` uses too, and each effect is one `case` in `react`. The eight added in v0.44.0: Obsidian (a barrier, `HeroEntity.barrier`, soaking in `shieldHero` after the Defensive and before the Ward), Lightning Rod (`refundDodgeCharge`, `quickUntil`), Sunder (`sunderUntil`), Seedling and Siphon (an orb and motes, which the Training Grounds get too), Crystallize, Blackout and Galvanize; the five buff ones wait `reactionCooldown` (`HeroEntity.reactionReadyAt`). Numbers: `balance.json → delve.stacks` and `delve.reactions`. The client draws the stack pips under each foe and the lasting states in `fx/draw-world.ts`, the moment in `arena/fx/reactions.ts` ("MELT! ×2" from the `hit` event's `pairs`), and the barrier and Galvanize on the HUD through the snapshot; the Training meter counts pairs. `tests/delve-pacing.test.ts` also sweeps all 15 pairs, forced (`AutopilotOptions.secondary`).
```

In the stacks spec, `**Status:** Draft.` becomes (one line, with Task 6's numbers):

```markdown
**Status:** Built in v0.45.0. The gate kept the starting `firePerStack` 0.35, `shockPerStack` 0.08, `hexPerStack` 0.06 and `reactionLockout` 1 s, and raised `poisonPerStack` from 0.6 to 1.7: at 0.6 the Balanced mana Nature Bolt lost 24% and the best fused Burst grew to ×3.29 the best single-element one (+35%), and the Nature Burst is the only single-element Burst a per-stack value can lift past that (at 1.0, even a 2 s lockout left +25%; 1.6 left +10.5%). Hard gates, depth 10, one dummy: the worst single-element basic −0.6% (Frost, sword), the worst Balanced mana Bolt, Burst or Nova −0.1% (the Frost Bolt), the Nature+Fire Burst in the pack at most ×1.31 its pre-stacks figure, and the fused/single Burst ratio ×2.45 → ×2.62 (+7.1%). Reported (40-seed means): single-element basics Fire +11% to +49%, Storm +8% to +15%, Shadow +5% to +11%, Nature +18% to +125% (the maul in the pack), Frost and Earth within 1.4%; pair basics from −51% to +109% a row (Frost+Earth, Storm+Nature and Earth+Nature gain most; Fire+Shadow and Shadow+Nature rows lose most); the basics top 30 trades Fire+Shadow and Fire+Storm for Storm+Nature and Earth+Nature on one dummy, and loses Fire+Shadow, Fire+Earth and Frost+Earth in the pack; single-element abilities' medians Fire +3.6%, Storm +6.5%, Shadow +4.9%, Nature +5.1%, Frost and Earth 0% (Fire and Nature Novas and Barrages up to ×4.4; Swift and Light ones, mostly charge-paid, down to −20%); fused Bursts Frost+Fire ×2.5 and Frost+Earth ×2.7, Frost+Nature −30% and Fire+Nature −18%, the rest +2% to +23%. The pacing rails hold: first dives 11, 11, 11, 3; the 15-pair sweep's median 29 (22–40).
```

In the pair reactions spec, after the heading `## Marks` and its blank line, add this line and a blank line:

```markdown
> **Superseded** by `2026-09-28-delve-elemental-stacks-design.md` (v0.45.0): a mark is now its element's stack count (`StatusState.stacks`; `hasMark` is a count above 0, or frozen for frost), and a reaction pairs a hit's stacks with another element's from earlier hits.
```

and above the paragraph that begins `**Using up the mark.** A reaction clears the mark F that set it off, with these exceptions:` add this line and a blank line:

```markdown
> **Superseded** by the elemental stacks spec (v0.45.0): a reaction takes pairs of stacks off both sides (`consumePairs`: every pair for a damage reaction, one for an effect), Soulfire and Blight included (`consumes` is gone), and a freeze ends only when frost was the partner, except under Superconduct.
```

- [ ] **Step 2: The version**

In `packages/client/package.json`: `"version": "0.44.0",` becomes `"version": "0.45.0",` (a feature: stacks change how every fight plays).

- [ ] **Step 3: Full verification**

Run, and check each is green before claiming anything:
- `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`: 73 files, 1200 tests (the pacing rails included); no type errors.
- `(cd packages/engine && pnpm build)`, then restart the 5288 dev server (header block; `True`).
- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`: no type errors; 88 files, 653 tests.
- `(pnpm -F @alloy/client build)`, then `(cd packages/client && grep -l '0\.45\.0' dist/assets/*.js)`: prints one `index-*.js` (the TabBar's version). `dist/` is git-ignored.
- `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`: 56 passed on the four device projects.

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 4: Commit**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-28-delve-elemental-stacks-design.md docs/superpowers/specs/2026-09-28-delve-pair-reactions-design.md packages/client/package.json
git commit -m "chore(client): bump version to 0.45.0" -m "Elemental stacks in the Delve notes, which also say where the version really comes from; the stacks spec's status and shifts; the pair reactions spec's marks and using-up marked superseded." -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`git status` must show nothing of this work left: only the three untracked 2026-05-01 plan docs. Don't push: the controller pushes after a final review.
