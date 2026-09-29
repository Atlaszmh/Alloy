# Delve DPS Lab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A developer-only page, `/delve/lab`, that simulates baseline DPS over 30 s for every basic-attack combo (weapon × element pair) and every ability combo (form × elements × weight × payment), with the button held and plain gear at a chosen depth, and shows the results as a ranked table and a DPS-over-time chart. To credit an ability with everything it deals, the engine's burn, poison and reaction-splash hits learn which ability slot caused them.

**Architecture:** The engine owns the sim. First, hit attribution (events only, no rule changes): `StatusState.burnSlot`/`poisonSlot` record the ability slot whose burn or poison set the damage (`applyStatus(…, slot)` from `hitMonster`'s status loop; spreading copies it), the burn and poison ticks in `step.ts` put it on their `hit` events, and `react()` passes the triggering hit's slot to Overload's and Combust's splash. `source` never changes, so the Training meter reads as before. Then `arpg/dps-sim.ts`: `simulateDps` builds a Training Grounds world (a plain common weapon at item level = depth, every toggle off), slides its neutral dummies to 0.4 units from the hero, holds one button for 900 fixed steps with every position put back after each step, and sums the held button's own `hit` events into a 60-sample running average. `dpsCombos` is the one function that knows the build model (252 basic setups, 4,320 ability setups, each labelled by `dims`), and `dpsKey` names a setup. The client only displays: `features/delve/lab/` holds a pure model (chip groups from `dims`, the filter, ranking, top-8 ticks, colours, the session cache), a table, a plain-SVG chart and a worker that runs the grid in batches of 50; `pages/DelveLab.tsx` wires them, with a fresh worker per request; `lab/dev-routes.tsx` makes the lazy route at module scope from `import.meta.env.DEV`, so a production build drops the page.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), React 19, React Router 7, a Vite module Web Worker, plain SVG, Playwright (a scratch screenshot pass).

**Spec:** `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md` (the requirements; read it first).

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management).
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). **One commit per task.** Every commit message ends with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; the commit blocks below pass it as the last `-m`.
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- **Don't push**: the controller pushes after a final review. Never open a PR.
- **The engine is rebuilt once, at the end of Task 2**, with `(cd packages/engine && pnpm build)`, before the first client task, and the 5288 dev server is restarted then (the engine's exports change; the user plays on that server). If you must rebuild later, restart the dev server after.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that pass `npx prettier --check` before the edit (the repo's own Prettier, 3.8.1, run from the repo root). Of the files this plan touches, one existing code file is not clean at HEAD: `packages/client/src/App.tsx` (CRLF; its content is Prettier-style, only the line endings differ). Edit it by hand and never format it. `CLAUDE.md` and the spec are Markdown: never format them. The known CRLF code files (`registry.ts`, `profile-schema.ts`, `autopilot.ts`, `delve-pacing.test.ts`) aren't touched by this plan. Every other existing file edited here passed `npx prettier --check` at HEAD; never commit a whole-file reformat. The code below is already Prettier-formatted (checked on the scratch copy), so the commit blocks' `--write` changes nothing if you typed it as written.
- **Line endings:** `packages/client/src/App.tsx` and `CLAUDE.md` use CRLF; every other file here, the spec included, is LF. Keep each file's endings (the Edit tool does; don't rewrite a file with a script that normalises them).
- `arpg/combat.ts` and `arpg/abilities/defend.ts` import each other's functions (a function-level cycle): only ever call an import inside a function, never at module top level.
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe (1e6 life) that doesn't fight back, and the fixture's foes are Fire (they resist fire); `pair()` (in the new test file) stands two of them 1.5 apart, within Overload's, Combust's and Blight's reach. The sandbox hero stands at `heroStart` (13, 26); the sim slides its dummies so the nearest one's edge is 0.4 from the hero's, straight ahead.
- The numbers below were measured on a scratch copy of this exact code before the plan was written (the sim is deterministic, so you should see the same).

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine build | `(cd packages/engine && pnpm build)` |
| Client typecheck + tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
| One client test file | `(cd packages/client && npx vitest run <path>)` |
| Client production build | `(pnpm -F @alloy/client build)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` (to pick devices use `--project=desktop` with the `=`: a bare `--project desktop` swallows the spec path) |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (Tasks 7–8; create it when needed, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging and the page's state, not guesses or longer timeouts. (On the scratch copy, a full run of `delve.spec.ts` and `delve-gamepad.spec.ts` had four load timeouts, D03 on three devices and G01 on desktop, that all passed when rerun alone.)

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/arpg.ts` | `StatusState.burnSlot`, `poisonSlot`; the `hit` event's `slot` doc |
| `src/arpg/world.ts` | `emptyStatus` starts both undefined |
| `src/arpg/combat.ts` | `applyStatus(…, slot)` and `poison(…, slot)` record the slot whose status sets the damage; `spreadAffliction` and Fire mastery's corpse flames copy it; `react(…, slot)` gives Overload's and Combust's splash the hit's slot |
| `src/arpg/step.ts` | the burn and poison ticks carry the slot |
| `src/arpg/dps-sim.ts` (new) | `DpsSetup`, `DpsOptions`, `DpsResult`, `DPS_SECONDS`, `simulateDps`, `dpsCombos`, `dpsKey` |
| `src/index.ts` | exports them |
| `tests/delve-dps-sim.test.ts` (new) | every engine test for this feature |

**Client (`packages/client/src/`)**

| File | Change |
|---|---|
| `features/delve/lab/lab-model.ts` (new) | `LabRow`, `DimGroup`, `LabFilter`, `dimGroups`, `passes`, `rank`, `topTicks`, `PALETTE`, `NONE_COLOR`, `BY_LINE`, `lineColor`, `formatDps`, the session cache (`remember`, `recall`) |
| `features/delve/lab/LabTable.tsx` (new) | the ranked table, one memoised row per result |
| `features/delve/lab/LabChart.tsx` (new) | the SVG chart, its legend and crosshair |
| `features/delve/lab/lab-worker.ts` (new) | runs the grid for one request, posting batches of 50 |
| `pages/DelveLab.tsx` (new) | the page |
| `features/delve/lab/dev-routes.tsx` (new) | `DEV_LAB` (the lazy page, dev builds only) and `LabButton` |
| `App.tsx` | the `/delve/lab` route, only when `DEV_LAB` exists |
| `components/AppShell.tsx` | no TabBar on `/delve/lab` |
| `pages/DelveTraining.tsx` | `<LabButton />` in the top bar |
| tests | `features/delve/lab/__tests__/{lab-model.test.ts, LabTable.test.tsx, LabChart.test.tsx, dev-routes.test.tsx}` (new), `pages/__tests__/DelveLab.test.tsx` (new), `features/delve/__tests__/training-meter.test.ts` |

`features/delve/training/meter.ts` needs no edit: it buckets a hit by its `source` before its `slot`. `package.json` keeps its version (see Task 8).

**Docs:** `CLAUDE.md` (a DPS Lab bullet), the spec's status line.

---

## Chunk 1: Engine: hit attribution

### Task 1: Burn, poison and reaction splash carry the ability slot

**Files:**
- Modify: `packages/engine/src/types/arpg.ts:135,152` (`StatusState`), `:409` (the `hit` event's doc)
- Modify: `packages/engine/src/arpg/world.ts:43,57` (`emptyStatus`)
- Modify: `packages/engine/src/arpg/combat.ts:52` (`HitOpts.slot`), `:116-136` (`poison`, `spreadAffliction`), `:165-215` (`applyStatus`), `:309-353` (`react`), `:466,530` (`hitMonster`), `:615-619` (`killMonster`'s corpse flames)
- Modify: `packages/engine/src/arpg/step.ts:432-443` (the burn and poison ticks)
- Create: `packages/engine/tests/delve-dps-sim.test.ts`
- Modify: `packages/client/src/features/delve/__tests__/training-meter.test.ts:29-30`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-28-delve-dps-lab.md
git commit -m "docs: Delve DPS Lab plan" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-dps-sim.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { arena, dummy, gear, registry, run } from './fixtures/arena.js';

type Hit = Extract<ArpgEvent, { kind: 'hit' }>;

/** The hits of one source (the Training meter buckets by source first). */
function hitsFrom(events: ArpgEvent[], source: Hit['source']): Hit[] {
  return events.filter((e): e is Hit => e.kind === 'hit' && e.source === source);
}

function ctxOf(w: ArpgWorld) {
  const events: ArpgEvent[] = [];
  return { ctx: makeCtx(registry, w, events), events };
}

/** Two sturdy foes 1.5 apart, and a hero that never swings. */
function pair(): ArpgWorld {
  return arena([dummy(13, 30), dummy(14.5, 30)], { noBasic: true });
}

describe('hit attribution', () => {
  it("an ability's Overload and Combust splash carry its slot, as reaction hits", () => {
    // Fire on a shocked foe sets off Overload; on a poisoned one, Combust.
    for (const mark of ['shock', 'poison'] as const) {
      const w = pair();
      const { ctx, events } = ctxOf(w);
      const [a, b] = w.monsters;
      applyStatus(ctx, a, mark, 100);
      hitMonster(ctx, a, 100, 'fire', { source: 'skill', slot: 0 });
      expect(hitsFrom(events, 'reaction').map((e) => [e.id, e.slot])).toEqual([[b.id, 0]]);
    }
  });

  it("a burn ticks with the slot that set its damage, and a basic's with none", () => {
    const w = pair();
    const { ctx } = ctxOf(w);
    const m = w.monsters[0];
    hitMonster(ctx, m, 100, 'fire', { source: 'skill', slot: 2, applies: ['burn'] });
    // A basic's weaker burn refreshes it, but the Ultimate's damage is what ticks.
    hitMonster(ctx, m, 10, 'fire', { source: 'basic', applies: ['burn'] });
    const ticks = hitsFrom(run(w, 1), 'dot');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((e) => e.slot === 2)).toBe(true);
    // A stronger basic burn takes the ticks over.
    hitMonster(ctx, m, 1000, 'fire', { source: 'basic', applies: ['burn'] });
    const after = hitsFrom(run(w, 1), 'dot');
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((e) => e.slot === undefined)).toBe(true);
  });

  it('a poison spread by Blight keeps the slot that set it', () => {
    const w = pair();
    const { ctx } = ctxOf(w);
    const [a, b] = w.monsters;
    hitMonster(ctx, a, 100, 'nature', { source: 'skill', slot: 0, applies: ['poison'] });
    // Shadow on the poisoned foe sets off Blight, which spreads its poison.
    hitMonster(ctx, a, 100, 'shadow', { source: 'skill', slot: 2 });
    const ticks = hitsFrom(run(w, 1), 'dot').filter((e) => e.id === b.id);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every((e) => e.slot === 0)).toBe(true);
  });

  it("Fire mastery's corpse flames keep the burn's slot", () => {
    const w = pair();
    w.hero.stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      attunement: { fire: 10 },
    });
    const { ctx } = ctxOf(w);
    const [a, b] = w.monsters;
    hitMonster(ctx, a, 100, 'fire', { source: 'skill', slot: 0, applies: ['burn'] });
    killMonster(ctx, a);
    expect(b.status.burnSlot).toBe(0);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: 4 FAIL: the splash test with "expected [ [ 1001, undefined ] ] to deeply equal [ [ 1001, +0 ] ]"; the burn and Blight tests with "expected false to be true" (their ticks carry no slot); the corpse-flame test with "expected undefined to be +0".

- [ ] **Step 3: The status fields**

In `src/types/arpg.ts`, `StatusState`: after `  burnTickAt: number;` add

```ts
  /** The ability slot whose burn set its damage (undefined: a basic's, or no slot's); its ticks carry it. */
  burnSlot: number | undefined;
```

and after `  poisonTickAt: number;` add

```ts
  /** The ability slot whose poison set its damage (see `burnSlot`). */
  poisonSlot: number | undefined;
```

In the `ArpgEvent` union's `hit` member, the comment `      /** Where the hit came from; for skill hits, the ability slot too (0 Primary, 1 Defensive, 2 Ultimate). */` becomes

```ts
      /**
       * Where the hit came from, and the ability slot (0 Primary, 1 Defensive, 2 Ultimate) behind
       * it: a skill hit's, or the one whose burn, poison or reaction splash this is.
       */
```

In `src/arpg/world.ts`, `emptyStatus()`: after `    burnTickAt: 0,` add `    burnSlot: undefined,`, and after `    poisonTickAt: 0,` add `    poisonSlot: undefined,`.

- [ ] **Step 4: The combat code records and passes the slot**

In `src/arpg/combat.ts`:

1. `HitOpts`: `  /** The ability slot dealing the hit; it doesn't charge itself. */` becomes

```ts
  /** The ability slot dealing the hit; it doesn't charge itself. Its burn, poison and reaction splash carry it too. */
```

2. `poison` (the whole function, with its comment) becomes

```ts
/**
 * Give `m` at least `stacks` poison stacks of `dps` each, refreshing the duration.
 * `slot` gets the ticks when this poison sets their damage.
 */
function poison(
  ctx: SimCtx,
  m: MonsterEntity,
  stacks: number,
  dps: number,
  slot: number | undefined,
): void {
  const s = m.status;
  const t = ctx.world.t;
  const active = isPoisoned(ctx, m);
  if (!active) s.poisonTickAt = t + 0.5;
  if (!active || dps >= s.poisonDps) s.poisonSlot = slot;
  s.poisonStacks = Math.min(poisonCap(ctx), Math.max(active ? s.poisonStacks : 0, stacks));
  s.poisonDps = active ? Math.max(s.poisonDps, dps) : dps;
  s.poisonUntil = t + ctx.bal.status.poisonDuration;
}
```

3. `spreadAffliction`: `    if (isPoisoned(ctx, m)) poison(ctx, o, m.status.poisonStacks, m.status.poisonDps);` becomes

```ts
    if (isPoisoned(ctx, m))
      poison(ctx, o, m.status.poisonStacks, m.status.poisonDps, m.status.poisonSlot);
```

4. `applyStatus`: its comment and signature

```ts
/** Apply `status`; with `rattles` (an Earth source) a stagger also rattles the foe. */
export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles = false,
): void {
```

become

```ts
/**
 * Apply `status`; with `rattles` (an Earth source) a stagger also rattles the foe.
 * `slot`: the ability applying it; a burn's or poison's ticks carry it when it sets their damage.
 */
export function applyStatus(
  ctx: SimCtx,
  m: MonsterEntity,
  status: StatusId,
  hitAmount: number,
  rattles = false,
  slot?: number,
): void {
```

In its `case 'burn':`, after `      const dps = hitAmount * st.burnDps;` add

```ts
      // A weaker refresh keeps the stronger burn's slot: its damage is what ticks.
      if (t >= s.burnUntil || dps >= s.burnDps) s.burnSlot = slot;
```

In its `case 'poison':`, `      poison(ctx, m, active ? s.poisonStacks + 1 : 1, hitAmount * st.poisonDps);` becomes `      poison(ctx, m, active ? s.poisonStacks + 1 : 1, hitAmount * st.poisonDps, slot);`.

5. `react`: its comment and signature

```ts
/**
 * A reaction's effect on `m` (its mark already used up). Returns the hit's
 * amount after it: the damage multipliers, times Catalyst.
 */
function react(ctx: SimCtx, m: MonsterEntity, id: ReactionId, amount: number): number {
```

become

```ts
/**
 * A reaction's effect on `m` (its mark already used up). Returns the hit's
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
```

In `case 'overload':`, `        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true });` becomes `        hitMonster(ctx, o, blast, 'storm', { source: 'reaction', noReact: true, slot });`, and in `case 'combust':`, `        hitMonster(ctx, o, hit, 'fire', { source: 'reaction', noReact: true });` becomes `        hitMonster(ctx, o, hit, 'fire', { source: 'reaction', noReact: true, slot });`.

6. `hitMonster`: `    amount = react(ctx, m, reaction, amount);` becomes `    amount = react(ctx, m, reaction, amount, opts.slot);`, and `  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount, opts.rattles);` becomes `  for (const s of opts.applies ?? []) applyStatus(ctx, m, s, amount, opts.rattles, opts.slot);`.

7. `killMonster`, the Fire mastery corpse flames: after `      if (o.dead || dist(o.x, o.y, m.x, m.y) > 2.5) continue;` add

```ts
      if (t >= o.status.burnUntil || m.status.burnDps >= o.status.burnDps)
        o.status.burnSlot = m.status.burnSlot;
```

(Defensive retaliation's statuses in `abilities/defend.ts` call `applyStatus` without a slot and stay unattributed: the spec scopes attribution to `hitMonster`'s status loop, and nothing reads it for the Defensive.)

- [ ] **Step 5: The ticks carry it**

In `src/arpg/step.ts`, `monstersTick`: `      hitMonster(ctx, m, s.burnDps * 0.5, 'fire', { source: 'dot', noReact: true });` becomes

```ts
      hitMonster(ctx, m, s.burnDps * 0.5, 'fire', {
        source: 'dot',
        noReact: true,
        slot: s.burnSlot,
      });
```

and the poison tick's options

```ts
      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', {
        source: 'dot',
        noReact: true,
      });
```

become

```ts
      hitMonster(ctx, m, s.poisonDps * s.poisonStacks * 0.5, 'nature', {
        source: 'dot',
        noReact: true,
        slot: s.poisonSlot,
      });
```

- [ ] **Step 6: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts && npx tsc --noEmit -p .)`
Expected: 4 PASS; no type errors.

Run: `(cd packages/engine && npx vitest run)`
Expected: 72 files, 1143 tests, all green (the pacing gate included: no rule changed).

- [ ] **Step 7: Pin that the Training meter reads as before**

The meter buckets a hit by its `source` first, so a `dot` or `reaction` hit that now carries a slot must stay in its own bucket. In `packages/client/src/features/delve/__tests__/training-meter.test.ts`, the first test's `        hit(60, 'reaction'),` becomes `        hit(60, 'reaction', 0),` and `        hit(70, 'dot'),` becomes `        hit(70, 'dot', 2),` (its expected buckets stay as they are).

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/training-meter.test.ts)`
Expected: PASS (it builds its own events, so it needs no engine rebuild; it passes before this edit too: it guards the meter from here on).

- [ ] **Step 8: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-dps-sim.test.ts packages/client/src/features/delve/__tests__/training-meter.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-dps-sim.test.ts packages/client/src/features/delve/__tests__/training-meter.test.ts
git commit -m "feat(engine): burn, poison and reaction splash carry the ability slot" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 2: Engine: the sim

### Task 2: `simulateDps`, `dpsCombos` and `dpsKey`

`DpsResult` has no breakdown by source, so two tests watch the sims' events through a pass-through mock of `stepWorld` (`vi.mock` is hoisted above the imports, so its state comes from `vi.hoisted`). Everything else, the attribution tests included, runs through the real `stepWorld` unchanged.

**Files:**
- Create: `packages/engine/src/arpg/dps-sim.ts`
- Modify: `packages/engine/src/index.ts:214` (exports, after the sandbox's)
- Modify: `packages/engine/tests/delve-dps-sim.test.ts` (imports; the event recorder; two new `describe`s)

- [ ] **Step 1: Write the failing tests**

In `tests/delve-dps-sim.test.ts`, replace the five import lines at the top with

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyStatus, hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import {
  DPS_SECONDS,
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import type { ArpgEvent, ArpgWorld } from '../src/types/arpg.js';
import { arena, dummy, gear, registry, run } from './fixtures/arena.js';
```

and append to the end of the file:

```ts

/** The sims' events, collected while `tap.on` is set (`stepWorld` itself is unchanged). */
const tap = vi.hoisted(() => ({ on: false, events: [] as ArpgEvent[] }));
vi.mock('../src/arpg/step.js', async (importOriginal) => {
  const step = await importOriginal<typeof import('../src/arpg/step.js')>();
  return {
    ...step,
    stepWorld: (...args: Parameters<typeof step.stepWorld>) => {
      const events = step.stepWorld(...args);
      if (tap.on) tap.events.push(...events);
      return events;
    },
  };
});

/** Run `f`, collecting every event its sims step through. */
function recorded<T>(f: () => T): { out: T; events: ArpgEvent[] } {
  tap.events = [];
  tap.on = true;
  try {
    return { out: f(), events: tap.events };
  } finally {
    tap.on = false;
  }
}

const grid = dpsCombos(registry);
const byKey = new Map(grid.map((s) => [dpsKey(s), s]));
function setup(key: string): DpsSetup {
  const s = byKey.get(key);
  if (!s) throw new Error(`No combo ${key}`);
  return s;
}
const ONE: DpsOptions = { depth: 10, pack: false };
const PACK: DpsOptions = { depth: 10, pack: true };
const sum = (hits: Hit[]) => hits.reduce((total, e) => total + e.amount, 0);

/** DPS between two sample times (`series` is a running average). */
function windowDps(series: number[], from: number, to: number): number {
  const dealt = (t: number) => series[t / 0.5 - 1] * t;
  return (dealt(to) - dealt(from)) / (to - from);
}

describe('dpsCombos', () => {
  it('252 basic combos and 4,320 ability combos, each with its own key', () => {
    expect(grid.filter((s) => s.view === 'basic')).toHaveLength(252);
    const abilities = grid.filter((s) => s.view === 'ability');
    expect(abilities).toHaveLength(4320);
    // Primary and Ultimate forms only.
    expect([...new Set(abilities.map((s) => s.dims.form))]).toEqual([
      'bolt',
      'volley',
      'lance',
      'burst',
      'strike',
      'nova',
      'barrage',
      'maelstrom',
    ]);
    expect(new Set(grid.map(dpsKey)).size).toBe(grid.length);
  });

  it('a setup carries its whole loadout, labelled by its dimensions', () => {
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
  });
});

describe('simulateDps', () => {
  it('gives the same result for the same setup', () => {
    const s = setup('ability|barrage|storm|nature|1|cast');
    expect(simulateDps(registry, s, PACK)).toEqual(simulateDps(registry, s, PACK));
  });

  it('every weapon strikes and deals damage, sampled every half second', () => {
    for (const base of registry.getGearBasesForSlot('weapon')) {
      const r = simulateDps(registry, setup(`basic|${base.id}|fire|none`), ONE);
      expect(r.series).toHaveLength(60);
      expect(r.dps).toBe(r.series[59]);
      expect(r.dps).toBeGreaterThan(0);
      expect(r.casts).toBeGreaterThan(0);
    }
  });

  it('a Fire basic run counts its strikes, and its burn ticks on top of its blows', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('basic|sword|fire|none'), ONE),
    );
    expect(out.casts).toBe(events.filter((e) => e.kind === 'basic').length);
    expect(hitsFrom(events, 'dot').length).toBeGreaterThan(0);
    expect(out.dps * DPS_SECONDS).toBeGreaterThan(sum(hitsFrom(events, 'basic')));
  });

  it("holds positions: an Earth Bolt's knockback never drives the dummy out of reach", () => {
    const r = simulateDps(registry, setup('ability|bolt|earth|none|0|mana'), ONE);
    const middle = windowDps(r.series, 10, 20);
    expect(middle).toBeGreaterThan(r.dps / 2);
    expect(Math.abs(windowDps(r.series, 20, 30) - middle)).toBeLessThan(middle * 0.25);
  });

  it('counts only the held ability: a mana-paid Crushing Nova never casts while basics swing', () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|nova|fire|none|2|mana'), ONE),
    );
    expect(out).toMatchObject({ dps: 0, casts: 0 });
    expect(hitsFrom(events, 'basic').length).toBeGreaterThan(0);
  });

  it("counts the ability's reaction splash: a Fire+Storm Bolt's Overload in a pack", () => {
    const { out, events } = recorded(() =>
      simulateDps(registry, setup('ability|bolt|fire|storm|0|mana'), PACK),
    );
    expect(out.casts).toBe(events.filter((e) => e.kind === 'cast' && e.slot === 0).length);
    expect(hitsFrom(events, 'reaction').filter((e) => e.slot === 0).length).toBeGreaterThan(0);
    const own = events.filter((e): e is Hit => e.kind === 'hit' && e.slot === 0);
    expect(out.dps * DPS_SECONDS).toBeCloseTo(sum(own));
  });

  it('a pack favours area: a Frost Nova gains more from five dummies than a Frost Bolt', () => {
    const gain = (key: string) =>
      simulateDps(registry, setup(key), PACK).dps / simulateDps(registry, setup(key), ONE).dps;
    expect(gain('ability|nova|frost|none|0|mana')).toBeGreaterThan(
      gain('ability|bolt|frost|none|0|mana'),
    );
  });

  it('deals more deeper', () => {
    const s = setup('basic|sword|fire|none');
    expect(simulateDps(registry, s, { depth: 20, pack: false }).dps).toBeGreaterThan(
      simulateDps(registry, s, ONE).dps,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: the file FAILS to load, no tests run: "Error: Cannot find module '../src/arpg/dps-sim.js' imported from '…/tests/delve-dps-sim.test.ts'".

- [ ] **Step 3: The sim**

Create `packages/engine/src/arpg/dps-sim.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { computeHeroStats } from '../delve/hero-stats.js';
import {
  ABILITY_PAYMENTS,
  ABILITY_SLOTS,
  ABILITY_WEIGHTS,
  type AbilityBuilds,
} from '../types/ability.js';
import type { ArpgEvent, ArpgInput } from '../types/arpg.js';
import { MANA_TYPES, type ManaType } from '../types/mana.js';
import { defaultAbilities } from './abilities/resolve.js';
import { dist } from './geometry.js';
import { createSandboxWorld, sandboxWeapon, spawnDummies } from './sandbox.js';
import { stepWorld } from './step.js';

/**
 * The DPS Lab's sim (a dev tool; see the DPS Lab spec): one loadout on the
 * Training Grounds' dummies for DPS_SECONDS, holding one button, with a plain
 * weapon at a depth and nothing else. Pure and deterministic: every run uses
 * the sandbox's world seed.
 */

/** One run: a whole loadout, labelled by the dimensions the lab filters and colours by. */
export interface DpsSetup {
  view: 'basic' | 'ability';
  /**
   * Filterable dimensions in display order, e.g. { weapon, primary, secondary } or
   * { form, first, second, weight, payment }. Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  weapon: { baseId: string; primary: ManaType; secondary: ManaType | null };
  abilities: AbilityBuilds;
  /** The button held: the basic attack, or an ability slot. */
  hold: 'attack' | { slot: number };
}

export interface DpsOptions {
  depth: number;
  /** Five dummies in a clump instead of one. */
  pack: boolean;
}

export interface DpsResult {
  /** Average DPS so far (damage ÷ elapsed), every 0.5 s (15 ticks): index i is at (i + 1) × 0.5 s. 60 samples. */
  series: number[];
  /** The last sample: DPS over the whole 30 s. */
  dps: number;
  /**
   * How often the held button acted: `basic` events (strikes) for `hold: 'attack'`, casts of
   * that slot for `hold: { slot }`. 0 means it never could, e.g. an unaffordable ability.
   */
  casts: number;
}

export const DPS_SECONDS = 30;
/** Seconds between samples. */
const SAMPLE = 0.5;
/** Edge to edge: the hero and the nearest dummy. */
const GAP = 0.4;
const NO_TOGGLES = { infiniteMana: false, noCooldowns: false, invulnerable: false };

/** Average DPS over time for one setup: the held button's own damage (see `DpsSetup.hold`). */
export function simulateDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult {
  const { baseId, primary, secondary } = setup.weapon;
  const weapon = sandboxWeapon(registry, {
    baseId,
    mana: primary,
    rarity: 'common',
    ilvl: o.depth,
  });
  const world = createSandboxWorld(registry, {
    depth: o.depth,
    stats: computeHeroStats({ weapon }, registry, { pair: { primary, secondary } }),
    abilities: setup.abilities,
    toggles: NO_TOGGLES,
  });
  const h = world.hero;
  const start = { x: h.x, y: h.y };
  const dummies = spawnDummies(registry, world, {
    layout: o.pack ? 'clump' : 'single',
    element: null,
  });
  // Both layouts stand their nearest dummy straight ahead: slide the group in to GAP.
  const near = dummies.reduce((a, b) =>
    dist(h.x, h.y, a.x, a.y) <= dist(h.x, h.y, b.x, b.y) ? a : b,
  );
  const slide = dist(h.x, h.y, near.x, near.y) - h.radius - near.radius - GAP;
  for (const m of dummies) {
    m.y += slide;
    m.dummy!.homeY = m.y;
  }

  const aim = { x: near.x, y: near.y };
  const hold = setup.hold;
  const slot = hold === 'attack' ? null : hold.slot;
  // A refused press (no mana) is dropped and pressed again next tick; one on cooldown waits.
  const input: ArpgInput =
    slot === null
      ? { move: { x: 0, y: 0 }, attack: true, attackAim: aim }
      : { move: { x: 0, y: 0 }, cast: { slot, aim } };
  const acted = (e: ArpgEvent) =>
    slot === null ? e.kind === 'basic' : e.kind === 'cast' && e.slot === slot;

  const step = registry.getDelveBalance().arena.step;
  const ticks = Math.round(SAMPLE / step);
  const series: number[] = [];
  let damage = 0;
  let casts = 0;
  for (let i = 0; i < DPS_SECONDS / SAMPLE; i++) {
    for (let k = 0; k < ticks; k++) {
      for (const e of stepWorld(registry, world, input, step)) {
        if (e.kind === 'hit' && (slot === null || e.slot === slot)) damage += e.amount;
        if (acted(e)) casts++;
      }
      // Positions are held: knockback, pulls and pushes never drift anyone out of reach.
      h.x = start.x;
      h.y = start.y;
      for (const m of dummies) {
        m.x = m.dummy!.homeX;
        m.y = m.dummy!.homeY;
        m.kbx = 0;
        m.kby = 0;
      }
    }
    series.push(damage / ((i + 1) * SAMPLE));
  }
  return { series, dps: series[series.length - 1], casts };
}

/**
 * Every combo the lab runs: each weapon base × primary × secondary (none, or
 * another element) on the basic attack, and each Primary or Ultimate form ×
 * element set × weight × payment on its ability. Ability setups carry a plain
 * sword and the pair `{ first, second }`, as the game limits abilities to the pair.
 * The only function here that knows the build model.
 */
export function dpsCombos(registry: DataRegistry): DpsSetup[] {
  const out: DpsSetup[] = [];
  // The secondary outermost, so each dimension's values first appear in MANA_TYPES order.
  for (const base of registry.getGearBasesForSlot('weapon'))
    for (const secondary of [null, ...MANA_TYPES])
      for (const primary of MANA_TYPES) {
        if (primary === secondary) continue;
        out.push({
          view: 'basic',
          dims: { weapon: base.id, primary, secondary: secondary ?? 'none' },
          weapon: { baseId: base.id, primary, secondary },
          abilities: defaultAbilities(primary),
          hold: 'attack',
        });
      }
  // Ordered: the first element deals the damage and decides the reactions.
  const sets = [null, ...MANA_TYPES].flatMap((second) =>
    MANA_TYPES.filter((first) => first !== second).map((first) =>
      second ? [first, second] : [first],
    ),
  );
  for (const form of registry.getArpgData().forms) {
    if (form.slot === 'defensive') continue;
    for (const elements of sets)
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
            },
            hold: { slot: ABILITY_SLOTS.indexOf(form.slot) },
          });
        }
  }
  return out;
}

/** A stable key: the view, then the `dims` values in order, e.g. `basic|sword|fire|none`. */
export function dpsKey(setup: DpsSetup): string {
  return [setup.view, ...Object.values(setup.dims)].join('|');
}
```

- [ ] **Step 4: Export it**

In `src/index.ts`, after the last line, `export type { SandboxWorldOptions } from './arpg/sandbox.js';`, add

```ts
export { simulateDps, dpsCombos, dpsKey, DPS_SECONDS } from './arpg/dps-sim.js';
export type { DpsSetup, DpsOptions, DpsResult } from './arpg/dps-sim.js';
```

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts && npx tsc --noEmit -p .)`
Expected: 14 PASS; no type errors.

What the scratch copy measured, at depth 10 (for comparison if one fails):
- Earth Bolt: 40.7 DPS over 30 s; 36.7 over 10–20 s and 35.6 over 20–30 s. Without the position hold, its 10–20 s DPS is 0.0 (the dummy ends at y 16.1, out of reach) and the test fails, as it should.
- Mana-paid Heavy and Crushing Novas: 0 casts (78 and 96 mana against a pool of 63); in the Crushing run basics still strike 36 times.
- Frost Nova: 4.5 DPS alone, 23.7 in the pack (×5.25); Frost Bolt: 40.7 and 55.6 (×1.37).
- Fire basics by weapon (DPS, strikes): dagger 35.8 (55), sword 33.3 (36), axe 33.1 (27), maul 34.1 (19), staff 24.8 (32), wand 29.2 (58), bow 26.3 (38). The Fire sword's 998 damage is 879 from blows and 119 from burn ticks.
- Fire+Storm Bolt in the pack: 1046.7 DPS, 624 Overload splash hits carrying slot 0 (and 236 more from the basics' own reactions, which don't count). Alone, it has no splash.
- Fire sword by depth: 10.5 (1), 17.5 (5), 33.3 (10), 115.5 (20), 390.3 (30).
- In a Fire Bolt run, every burn tick carries `slot: 0`, e.g. `{ kind: 'hit', source: 'dot', slot: 0, element: 'fire', amount: 4.05, … }`.
- The whole grid: 216 setups with `casts: 0` (Heavy and Crushing mana-paid Nova, Barrage and Maelstrom × 36 element sets), both with one dummy and the pack. It runs in about 1.5 s with one dummy and 3.3 s with the pack (the built engine, one thread).

Run: `(cd packages/engine && npx vitest run)`
Expected: 72 files, 1153 tests, all green.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts packages/engine/tests/delve-dps-sim.test.ts
git add packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts packages/engine/tests/delve-dps-sim.test.ts
git commit -m "feat(engine): simulateDps and the DPS Lab's grid" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 7: Rebuild the engine and restart the dev server**

Run: `(cd packages/engine && pnpm build) && (cd packages/client && npx tsc --noEmit -p .)`
Expected: the build succeeds; no type errors (nothing in the client uses the new exports yet).

The engine's exports changed: run the dev-server block (header). Expected: `True`.

---

## Chunk 3: Client: the lab's model, table and chart

Everything in `features/delve/lab/` reads a setup only through its `dims`: nothing in the client names a dimension. The chart's palette is the dark categorical palette of the dataviz reference, validated on the panel surface (`#1b1b27`): every check passes (worst adjacent CVD ΔE 8.4, normal-vision 19.3, all ≥ 3:1).

### Task 3: The model

**Files:**
- Create: `packages/client/src/features/delve/lab/lab-model.ts`
- Create: `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MANA_TYPES, dpsCombos, type DpsSetup } from '@alloy/engine';
import { manaStyle } from '../../format';
import { getDelveRegistry } from '../../registry';
import {
  BY_LINE,
  NONE_COLOR,
  PALETTE,
  dimGroups,
  formatDps,
  lineColor,
  passes,
  rank,
  recall,
  remember,
  topTicks,
  type LabRow,
} from '../lab-model';

/** A made-up row: the model reads only its `dims`, `dps` and `casts`. */
function row(dims: Record<string, string>, dps: number, casts = 1): LabRow {
  const setup = { view: 'ability', dims } as unknown as DpsSetup;
  return { key: Object.values(dims).join('|'), setup, result: { series: [dps], dps, casts } };
}

describe('lab-model', () => {
  it('groups each dims key, in order, with every value once in grid order', () => {
    const setups = [
      row({ form: 'bolt', first: 'fire', second: 'none' }, 1),
      row({ form: 'nova', first: 'fire', second: 'storm' }, 1),
      row({ form: 'bolt', first: 'frost', second: 'none' }, 1),
    ].map((r) => r.setup);
    expect(dimGroups(setups)).toEqual([
      { key: 'form', values: ['bolt', 'nova'] },
      { key: 'first', values: ['fire', 'frost'] },
      { key: 'second', values: ['none', 'storm'] },
    ]);
    // The engine's grid lists each dimension's values in a sensible order.
    const basics = dpsCombos(getDelveRegistry()).filter((s) => s.view === 'basic');
    expect(dimGroups(basics).map((g) => [g.key, g.values.length])).toEqual([
      ['weapon', 7],
      ['primary', 6],
      ['secondary', 7],
    ]);
    expect(dimGroups(basics)[2].values).toEqual(['none', ...MANA_TYPES]);
  });

  it('a row passes unless one of its values is switched off', () => {
    const { setup } = row({ form: 'bolt', first: 'fire' }, 1);
    expect(passes(setup, {})).toBe(true);
    expect(passes(setup, { form: ['nova'] })).toBe(true);
    expect(passes(setup, { form: ['nova'], first: ['fire'] })).toBe(false);
  });

  it('ranks by DPS, and a row whose held button never acted goes last', () => {
    const rows = [
      row({ id: 'a' }, 5),
      row({ id: 'b' }, 0, 0),
      row({ id: 'c' }, 9),
      row({ id: 'd' }, 0, 3),
      row({ id: 'e' }, 7),
    ];
    expect(rank(rows).map((r) => r.key)).toEqual(['c', 'e', 'a', 'd', 'b']);
  });

  it('ticks the top 8', () => {
    const ranked = rank(Array.from({ length: 10 }, (_, i) => row({ id: `r${i}` }, i)));
    expect([...topTicks(ranked)]).toEqual(['r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r3', 'r2']);
  });

  it("colours by line, or by a dimension's value: an element its own colour, none grey", () => {
    const groups = dimGroups([row({ form: 'bolt' }, 1).setup, row({ form: 'nova' }, 1).setup]);
    const r = row({ form: 'nova', first: 'frost', second: 'none' }, 1);
    expect(lineColor(BY_LINE, r, 3, groups)).toBe(PALETTE[3]);
    expect(lineColor('first', r, 3, groups)).toBe(manaStyle(getDelveRegistry(), 'frost').color);
    expect(lineColor('second', r, 3, groups)).toBe(NONE_COLOR);
    // Any other value takes the palette by its place in its group.
    expect(lineColor('form', r, 3, groups)).toBe(PALETTE[1]);
  });

  it('keeps results for the session by depth, pack and key', () => {
    const a = row({ id: 'a' }, 1);
    const b = row({ id: 'b' }, 2);
    remember(7, true, [b]);
    expect(recall(7, true, ['a', 'b'])).toEqual([b]);
    expect(recall(7, false, ['a', 'b'])).toEqual([]);
    remember(7, true, [a]);
    expect(recall(7, true, ['a', 'b'])).toEqual([a, b]);
  });

  it('shows DPS to a tenth below 100, whole above', () => {
    expect(formatDps(12.345)).toBe('12.3');
    expect(formatDps(1046.4)).toBe('1046');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/lab-model.test.ts)`
Expected: the file FAILS, no tests run: 'Failed to resolve import "../lab-model" from "src/features/delve/lab/__tests__/lab-model.test.ts". Does the file exist?'

- [ ] **Step 3: Implement**

Create `packages/client/src/features/delve/lab/lab-model.ts`:

```ts
import { MANA_TYPES, type DpsResult, type DpsSetup, type ManaType } from '@alloy/engine';
import { manaStyle } from '../format';
import { getDelveRegistry } from '../registry';

/**
 * The DPS Lab's pure helpers. The lab never names a dimension: its chips,
 * columns and colours all come from each setup's `dims` (see the DPS Lab spec).
 */

/** One finished run, as the worker posts it. */
export interface LabRow {
  key: string;
  setup: DpsSetup;
  result: DpsResult;
}

/** One chip group: a `dims` key and every value it takes, in grid order. */
export interface DimGroup {
  key: string;
  values: string[];
}

/** The chips switched off, per `dims` key (every chip starts on). */
export type LabFilter = Record<string, readonly string[]>;

/** The chip groups of some setups: one per `dims` key, in order, each value once. */
export function dimGroups(setups: readonly DpsSetup[]): DimGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const s of setups)
    for (const [key, value] of Object.entries(s.dims)) {
      if (!groups.has(key)) groups.set(key, new Set());
      groups.get(key)!.add(value);
    }
  return [...groups].map(([key, values]) => ({ key, values: [...values] }));
}

export function passes(setup: DpsSetup, off: LabFilter): boolean {
  return Object.entries(setup.dims).every(([key, value]) => !off[key]?.includes(value));
}

/** Highest DPS first; a row whose held button never acted (`casts: 0`) goes last. */
export function rank(rows: readonly LabRow[]): LabRow[] {
  const idle = (r: LabRow) => (r.result.casts === 0 ? 1 : 0);
  return [...rows].sort((a, b) => idle(a) - idle(b) || b.result.dps - a.result.dps);
}

/** The rows charted until the reader ticks one: the top 8. */
export function topTicks(ranked: readonly LabRow[]): Set<string> {
  return new Set(ranked.slice(0, 8).map((r) => r.key));
}

/** The dark categorical palette, in its order (validated on the panel surface). */
export const PALETTE = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
];
/** No element ('none'): stone grey. */
export const NONE_COLOR = '#a8a29e';
/** Colour by "Line": each charted line its own colour. Any other choice is a `dims` key. */
export const BY_LINE = 'line';

/**
 * A charted line's colour. By line: its place among the charted lines. By a
 * dimension: its value's, an element's own colour, 'none' grey, anything else
 * the palette by the value's place in its group.
 */
export function lineColor(
  colorBy: string,
  row: LabRow,
  index: number,
  groups: readonly DimGroup[],
): string {
  if (colorBy === BY_LINE) return PALETTE[index % PALETTE.length];
  const value = row.setup.dims[colorBy];
  if (value === 'none') return NONE_COLOR;
  if ((MANA_TYPES as readonly string[]).includes(value))
    return manaStyle(getDelveRegistry(), value as ManaType).color;
  const values = groups.find((g) => g.key === colorBy)?.values ?? [];
  return PALETTE[Math.max(0, values.indexOf(value)) % PALETTE.length];
}

/** 12.3 below 100, else whole (1046). */
export function formatDps(dps: number): string {
  return dps.toFixed(dps < 100 ? 1 : 0);
}

/** Every result this session, keyed `depth|pack|dpsKey`, so flipping back is instant. */
const kept = new Map<string, LabRow>();

export function remember(depth: number, pack: boolean, rows: readonly LabRow[]): void {
  for (const r of rows) kept.set(`${depth}|${pack}|${r.key}`, r);
}

/** The results kept for these options, in the order of `keys` (the ones not run yet left out). */
export function recall(depth: number, pack: boolean, keys: readonly string[]): LabRow[] {
  return keys.flatMap((key) => kept.get(`${depth}|${pack}|${key}`) ?? []);
}
```

(`manaStyle(registry, m).color` is the same value as the spec's `manaStyles(registry)[m].color`, from the same file, without building the whole map per line.)

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/lab-model.test.ts && npx tsc --noEmit -p .)`
Expected: 7 PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/lab/lab-model.ts packages/client/src/features/delve/lab/__tests__/lab-model.test.ts
git add packages/client/src/features/delve/lab/lab-model.ts packages/client/src/features/delve/lab/__tests__/lab-model.test.ts
git commit -m "feat(client): the DPS Lab's model: chips from dims, ranking, ticks, colours, session cache" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The table and the chart

The table lists every row that passes the filters (4,320 in the full Abilities view), so its rows are memoised: with a stable tick handler (Task 5), a tick re-renders the row it changes instead of all of them (measured in the dev server: 440 ms down to 180 ms per tick). The chart's drawing is as wide as its panel (a `ResizeObserver`), so its 10 px text keeps its size: a fixed 640-wide viewBox scaled it to about 20 px on a desktop and 5 px on a phone.

**Files:**
- Create: `packages/client/src/features/delve/lab/LabTable.tsx`
- Create: `packages/client/src/features/delve/lab/LabChart.tsx`
- Create: `packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx`
- Create: `packages/client/src/features/delve/lab/__tests__/LabChart.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { DpsSetup } from '@alloy/engine';
import { LabTable } from '../LabTable';
import type { LabRow } from '../lab-model';

/** A made-up ability row keyed `form|first`. */
function row(key: string, dps: number, casts = 2): LabRow {
  const [form, first] = key.split('|');
  const setup = { view: 'ability', dims: { form, first } } as unknown as DpsSetup;
  return { key, setup, result: { series: [], dps, casts } };
}

describe('LabTable', () => {
  it('lists each row with its dimensions and DPS; a tick charts it', () => {
    const onTick = vi.fn();
    render(
      <LabTable
        rows={[row('bolt|fire', 40), row('nova|frost', 20), row('nova|fire', 0, 0)]}
        columns={['form', 'first']}
        ticked={new Set(['bolt|fire'])}
        onTick={onTick}
      />,
    );
    const rows = screen.getAllByTestId('lab-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'boltfire40.0',
      'novafrost20.0',
      "novafirecan't afford",
    ]);
    // The bar is scaled to the top row.
    expect(within(rows[1]).getByTestId('lab-bar')).toHaveStyle({ width: '50%' });
    expect(screen.getByTestId('lab-tick-bolt|fire')).toBeChecked();
    expect(screen.getByTestId('lab-tick-nova|frost')).not.toBeChecked();
    fireEvent.click(screen.getByTestId('lab-tick-nova|frost'));
    expect(onTick).toHaveBeenCalledWith('nova|frost');
  });
});
```

Create `packages/client/src/features/delve/lab/__tests__/LabChart.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LabChart, type ChartLine } from '../LabChart';

/** 60 samples: `early` for the first 2.5 s, then `settled`. */
function series(early: number, settled: number): number[] {
  return Array.from({ length: 60 }, (_, i) => (i < 5 ? early : settled));
}

function line(key: string, s: number[]): ChartLine {
  return { key, label: key, color: '#fff', series: s };
}

describe('LabChart', () => {
  afterEach(() => vi.restoreAllMocks());

  it('draws a path per line, scaled from 3 s on, so an early spike clips at the top', () => {
    render(<LabChart lines={[line('a', series(1000, 37)), line('b', series(5, 20))]} />);
    const paths = screen.getAllByTestId('lab-line');
    expect(paths).toHaveLength(2);
    const topLabel = screen.getByTestId('lab-y-top');
    expect(topLabel).toHaveTextContent('40.0');
    const ys = [...paths[0].getAttribute('d')!.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys[0]).toBe(Number(topLabel.getAttribute('y')));
    expect(ys[59]).toBeGreaterThan(ys[0]);
  });

  it("the crosshair reads out the time and each line's DPS there", () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 640,
      height: 240,
    } as DOMRect);
    const rising = Array.from({ length: 60 }, (_, i) => i + 1);
    render(<LabChart lines={[line('a', rising)]} />);
    expect(screen.getByTestId('lab-readout-time')).toHaveTextContent('DPS over 30 s');
    // 336 px across a 640 px chart is 15 s.
    fireEvent.pointerMove(screen.getByRole('img'), { clientX: 336 });
    expect(screen.getByTestId('lab-readout-time')).toHaveTextContent('DPS at 15 s');
    expect(screen.getByTestId('lab-legend')).toHaveTextContent('30.0');
    expect(screen.getByTestId('lab-crosshair')).toBeInTheDocument();
  });
});
```

(jsdom's `ResizeObserver` is a stub that never calls back, so the chart keeps its 640-wide default there: 336 px is (15 / 30) × 584 + 44, the plot's left edge plus half its width.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/LabTable.test.tsx src/features/delve/lab/__tests__/LabChart.test.tsx)`
Expected: both files FAIL, no tests run: 'Failed to resolve import "../LabTable"' and 'Failed to resolve import "../LabChart"'.

- [ ] **Step 3: The table**

Create `packages/client/src/features/delve/lab/LabTable.tsx`:

```tsx
import { memo } from 'react';
import { formatDps, type LabRow } from './lab-model';

/**
 * The results that pass the filters, ranked: their dimensions, then DPS as a
 * number and a bar scaled to the top row. A row whose held button never acted
 * is greyed as "can't afford". Each row's tick decides whether it is charted.
 */
export function LabTable({
  rows,
  columns,
  ticked,
  onTick,
}: {
  /** Already ranked (`rank`). */
  rows: readonly LabRow[];
  /** The view's `dims` keys, in order. */
  columns: readonly string[];
  ticked: ReadonlySet<string>;
  /** Keep it the same function: the rows are memoised on it. */
  onTick: (key: string) => void;
}) {
  const top = rows[0]?.result.dps || 1;
  return (
    <table className="w-full text-xs" data-testid="lab-table">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-widest text-stone-500">
          <th className="w-6 font-normal" />
          {columns.map((c) => (
            <th key={c} className="px-1 py-1 font-normal">
              {c}
            </th>
          ))}
          <th className="w-2/5 px-1 py-1 font-normal">DPS</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Row
            key={r.key}
            row={r}
            columns={columns}
            top={top}
            ticked={ticked.has(r.key)}
            onTick={onTick}
          />
        ))}
      </tbody>
    </table>
  );
}

/** One result. Memoised: thousands of rows, and a chip or a tick changes few of them. */
const Row = memo(function Row({
  row,
  columns,
  top,
  ticked,
  onTick,
}: {
  row: LabRow;
  columns: readonly string[];
  top: number;
  ticked: boolean;
  onTick: (key: string) => void;
}) {
  const acted = row.result.casts > 0;
  return (
    <tr
      className={acted ? 'text-stone-200' : 'text-stone-500'}
      data-testid="lab-row"
      data-key={row.key}
    >
      <td>
        <input
          type="checkbox"
          checked={ticked}
          onChange={() => onTick(row.key)}
          aria-label={`Chart ${row.key}`}
          data-testid={`lab-tick-${row.key}`}
        />
      </td>
      {columns.map((c) => (
        <td key={c} className="px-1">
          {row.setup.dims[c]}
        </td>
      ))}
      <td className="px-1">
        {acted ? (
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right tabular-nums">
              {formatDps(row.result.dps)}
            </span>
            <div className="h-1.5 flex-1">
              <div
                className="h-full rounded-full bg-amber-400/70"
                data-testid="lab-bar"
                style={{ width: `${(row.result.dps / top) * 100}%` }}
              />
            </div>
          </div>
        ) : (
          "can't afford"
        )}
      </td>
    </tr>
  );
});
```

- [ ] **Step 4: The chart**

Create `packages/client/src/features/delve/lab/LabChart.tsx`:

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DPS_SECONDS } from '@alloy/engine';
import { formatDps } from './lab-model';

export interface ChartLine {
  key: string;
  label: string;
  color: string;
  /** Average DPS so far, every SAMPLE seconds: index i is at (i + 1) × SAMPLE. */
  series: readonly number[];
}

const H = 240;
const LEFT = 44;
const RIGHT = 12;
const TOP = 10;
const BOTTOM = 22;
const SAMPLE = 0.5;
/** The y scale ignores the samples before this: mana payments front-load, and those clip. */
const SETTLED = 3;

/** Round up to a tidy axis top: 437 → 450, 1046 → 1500. */
function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return (Math.ceil((v / p) * 2) / 2) * p;
}

/**
 * DPS over time for the ticked rows, in plain SVG: one path per line, y from
 * 0 to the highest sample from 3 s on (earlier ones clip at the top edge), a
 * legend, and a crosshair that reads out the time and each line's DPS. The
 * drawing is as wide as its panel, so text keeps its size on any screen.
 */
export function LabChart({ lines }: { lines: readonly ChartLine[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, e.contentRect.width)));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const top = niceCeil(Math.max(0, ...lines.flatMap((l) => l.series.slice(SETTLED / SAMPLE - 1))));
  const x = (t: number) => LEFT + (t / DPS_SECONDS) * (w - LEFT - RIGHT);
  const y = (v: number) => TOP + (1 - Math.min(v, top) / top) * (H - TOP - BOTTOM);
  const last = DPS_SECONDS / SAMPLE - 1;
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const t = ((((e.clientX - r.left) / r.width) * w - LEFT) / (w - LEFT - RIGHT)) * DPS_SECONDS;
    setHover(Math.min(last, Math.max(0, Math.round(t / SAMPLE) - 1)));
  };
  const at = hover ?? last;

  return (
    <div ref={box} className="delve-panel mb-2 p-2" data-testid="lab-chart">
      <svg
        viewBox={`0 0 ${w} ${H}`}
        className="block w-full"
        role="img"
        aria-label="DPS over time"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={LEFT} x2={w - RIGHT} y1={y(top * f)} y2={y(top * f)} stroke="#ffffff1a" />
            <text
              x={LEFT - 6}
              y={y(top * f)}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill="#a8a29e"
              data-testid={f === 1 ? 'lab-y-top' : undefined}
            >
              {formatDps(top * f)}
            </text>
          </g>
        ))}
        {[0, 5, 10, 15, 20, 25, 30].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} fill="#a8a29e">
            {t}s
          </text>
        ))}
        {lines.map((l) => (
          <path
            key={l.key}
            d={l.series
              .map((v, i) => `${i ? 'L' : 'M'}${x((i + 1) * SAMPLE).toFixed(1)},${y(v).toFixed(1)}`)
              .join('')}
            fill="none"
            stroke={l.color}
            strokeWidth={2}
            strokeLinejoin="round"
            data-testid="lab-line"
          />
        ))}
        {hover !== null && (
          <line
            x1={x((hover + 1) * SAMPLE)}
            x2={x((hover + 1) * SAMPLE)}
            y1={TOP}
            y2={H - BOTTOM}
            stroke="#e7e5e4"
            strokeOpacity={0.5}
            data-testid="lab-crosshair"
          />
        )}
      </svg>
      <ul className="mt-1 flex flex-col gap-0.5 text-[11px]" data-testid="lab-legend">
        <li className="text-stone-500" data-testid="lab-readout-time">
          {hover === null ? 'DPS over 30 s' : `DPS at ${(hover + 1) * SAMPLE} s`}
        </li>
        {lines.map((l) => (
          <li key={l.key} className="flex items-center gap-2">
            <span className="h-0.5 w-4 shrink-0 rounded" style={{ background: l.color }} />
            <b className="w-12 shrink-0 text-right tabular-nums text-stone-100">
              {formatDps(l.series[at] ?? 0)}
            </b>
            <span className="truncate text-stone-400">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

The legend doubles as the hover readout: each line's value leads (the final DPS, or its value at the crosshair), its label follows, keyed by a short stroke of its colour.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx vitest run src/features/delve/lab && npx tsc --noEmit -p .)`
Expected: 3 files, 10 tests PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/lab/LabTable.tsx packages/client/src/features/delve/lab/LabChart.tsx packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx packages/client/src/features/delve/lab/__tests__/LabChart.test.tsx
git add packages/client/src/features/delve/lab/LabTable.tsx packages/client/src/features/delve/lab/LabChart.tsx packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx packages/client/src/features/delve/lab/__tests__/LabChart.test.tsx
git commit -m "feat(client): the DPS Lab's table and chart" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 4: Client: the page, and the way in

The page comes before its route: `dev-routes.tsx` imports `pages/DelveLab`, which must exist for the client to type-check and for Vite to resolve the import.

### Task 5: The page and its worker

The page runs the whole grid (both views) for the current depth and pack: on load, when the depth slider is let go, and when Pack is switched. Each request gets a fresh worker and the previous one is terminated (a synchronous worker can't see a newer message mid-run, so there are no run ids). Results go into the session cache as they arrive; a run the cache has whole needs no worker, and an incomplete one (interrupted by a newer request) is run again whole. Until the reader ticks a row, the chart shows the current top 8 (`ticks` is null), so it follows the results as they stream in; a chip or a view change goes back to that, while a depth or Pack change keeps the reader's ticks (the setups are the same). The tick handler stays one function for the page's life (a ref to the charted set, updated after each render), so the table's memoised rows don't all re-render.

**Files:**
- Create: `packages/client/src/features/delve/lab/lab-worker.ts`
- Create: `packages/client/src/pages/DelveLab.tsx`
- Create: `packages/client/src/pages/__tests__/DelveLab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/pages/__tests__/DelveLab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { dpsCombos, dpsKey } from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import type { LabRow } from '@/features/delve/lab/lab-model';
import { DelveLab } from '../DelveLab';

/** Stands in for the lab's worker: the test answers each request itself. */
class FakeWorker {
  static all: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<LabRow[]>) => void) | null = null;
  requests: unknown[] = [];
  terminated = false;
  constructor() {
    FakeWorker.all.push(this);
  }
  postMessage(msg: unknown) {
    this.requests.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  /** Post these rows back, as the worker does. */
  reply(rows: LabRow[]) {
    act(() => this.onmessage?.({ data: rows } as MessageEvent<LabRow[]>));
  }
}
const latest = () => FakeWorker.all[FakeWorker.all.length - 1];

const grid = dpsCombos(getDelveRegistry());
const byKey = new Map(grid.map((s) => [dpsKey(s), s]));
/** A fixed result for the grid's setup `key`: flat at `dps`. */
function result(key: string, dps: number, casts = 3): LabRow {
  return { key, setup: byKey.get(key)!, result: { series: Array(60).fill(dps), dps, casts } };
}
const rowKeys = () => screen.getAllByTestId('lab-row').map((r) => r.getAttribute('data-key'));

function renderLab() {
  render(
    <MemoryRouter>
      <DelveLab />
    </MemoryRouter>,
  );
}

describe('DelveLab', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs the grid at depth 10 on one dummy, then shows the chips and the rows ranked', () => {
    renderLab();
    expect(latest().requests).toEqual([{ depth: 10, pack: false }]);
    latest().reply([
      result('basic|sword|fire|none', 30),
      result('basic|bow|storm|none', 50),
      result('basic|axe|frost|fire', 40),
    ]);
    expect(screen.getByTestId('lab-chip-weapon-sword')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('lab-chip-secondary-none')).toBeInTheDocument();
    expect(rowKeys()).toEqual([
      'basic|bow|storm|none',
      'basic|axe|frost|fire',
      'basic|sword|fire|none',
    ]);
    expect(screen.getByTestId('lab-progress')).toBeInTheDocument();
  });

  it('a chip narrows the rows', () => {
    renderLab();
    latest().reply([result('basic|sword|fire|none', 30), result('basic|bow|storm|none', 50)]);
    fireEvent.click(screen.getByTestId('lab-chip-weapon-bow'));
    expect(screen.getByTestId('lab-chip-weapon-bow')).toHaveAttribute('aria-pressed', 'false');
    expect(rowKeys()).toEqual(['basic|sword|fire|none']);
  });

  it('charts the top 8, one path per ticked row', () => {
    renderLab();
    const basics = grid.filter((s) => s.view === 'basic').slice(0, 10);
    latest().reply(basics.map((s, i) => result(dpsKey(s), 10 + i)));
    expect(screen.getAllByTestId('lab-line')).toHaveLength(8);
    fireEvent.click(screen.getByTestId(`lab-tick-${dpsKey(basics[9])}`));
    expect(screen.getAllByTestId('lab-line')).toHaveLength(7);
  });

  it("an unaffordable ability sits last, as can't afford", () => {
    renderLab();
    latest().reply([
      result('ability|nova|fire|none|2|mana', 0, 0),
      result('ability|bolt|fire|none|0|mana', 40),
    ]);
    fireEvent.click(screen.getByTestId('lab-tab-ability'));
    expect(rowKeys()).toEqual(['ability|bolt|fire|none|0|mana', 'ability|nova|fire|none|2|mana']);
    expect(screen.getAllByTestId('lab-row')[1]).toHaveTextContent("can't afford");
  });

  it('a new depth (on release) or Pack starts a fresh worker; a finished run is kept', () => {
    renderLab();
    const first = latest();
    fireEvent.change(screen.getByTestId('lab-depth'), { target: { value: '20' } });
    expect(FakeWorker.all).toHaveLength(1);
    fireEvent.pointerUp(screen.getByTestId('lab-depth'));
    expect(first.terminated).toBe(true);
    expect(latest().requests).toEqual([{ depth: 20, pack: false }]);
    latest().reply(grid.map((s) => result(dpsKey(s), 1)));
    expect(screen.queryByTestId('lab-progress')).toBeNull();

    fireEvent.click(screen.getByTestId('lab-pack'));
    expect(latest().requests).toEqual([{ depth: 20, pack: true }]);
    // Back to one dummy: the session kept that run, so no worker is needed.
    fireEvent.click(screen.getByTestId('lab-pack'));
    expect(FakeWorker.all).toHaveLength(3);
    expect(screen.queryByTestId('lab-progress')).toBeNull();
  });
});
```

(`byKey` matters: finding each of the 4,572 setups with `grid.find` and `dpsKey` made the last test take over 5 s under the full suite's load.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveLab.test.tsx)`
Expected: the file FAILS, no tests run: 'Failed to resolve import "../DelveLab" from "src/pages/__tests__/DelveLab.test.tsx". Does the file exist?'

- [ ] **Step 3: The worker**

Create `packages/client/src/features/delve/lab/lab-worker.ts`:

```ts
/// <reference lib="webworker" />
import {
  createDefaultRegistry,
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
} from '@alloy/engine';
import type { LabRow } from './lab-model';

/**
 * Runs the DPS Lab's whole grid for one request, posting its rows in batches
 * of 50. The page starts a fresh worker for every request.
 */

const BATCH = 50;
const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<DpsOptions>) => {
  const registry = createDefaultRegistry();
  let batch: LabRow[] = [];
  for (const setup of dpsCombos(registry)) {
    batch.push({ key: dpsKey(setup), setup, result: simulateDps(registry, setup, e.data) });
    if (batch.length === BATCH) {
      scope.postMessage(batch);
      batch = [];
    }
  }
  if (batch.length > 0) scope.postMessage(batch);
};
```

The unit tests replace the worker; Task 7 runs the real one in the dev server.

- [ ] **Step 4: The page**

Create `packages/client/src/pages/DelveLab.tsx`:

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { dpsCombos, dpsKey, type DpsOptions, type DpsSetup } from '@alloy/engine';
import { MAX_DEPTH } from '@/stores/sandboxStore';
import { Chip } from '@/features/delve/AbilitiesPanel';
import { getDelveRegistry } from '@/features/delve/registry';
import { LabChart } from '@/features/delve/lab/LabChart';
import { LabTable } from '@/features/delve/lab/LabTable';
import {
  BY_LINE,
  dimGroups,
  lineColor,
  passes,
  rank,
  recall,
  remember,
  topTicks,
  type LabFilter,
  type LabRow,
} from '@/features/delve/lab/lab-model';
import '@/features/delve/delve.css';

type View = DpsSetup['view'];

const VIEWS: [View, string][] = [
  ['basic', 'Basics'],
  ['ability', 'Abilities'],
];
const SELECT = 'rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-xs text-stone-200';

/**
 * The DPS Lab (dev builds only): every basic-attack and ability combo's
 * baseline DPS over 30 s, simulated by the engine in a worker, as a ranked
 * table and a chart of the ticked rows. See the DPS Lab spec.
 */
export function DelveLab() {
  const navigate = useNavigate();
  const grid = useMemo(() => dpsCombos(getDelveRegistry()), []);
  const keys = useMemo(() => grid.map(dpsKey), [grid]);
  const [view, setView] = useState<View>('basic');
  /** The slider's value while dragged; `depth` follows on release. */
  const [slider, setSlider] = useState(10);
  const [depth, setDepth] = useState(10);
  const [pack, setPack] = useState(false);
  const [colorBy, setColorBy] = useState(BY_LINE);
  const [off, setOff] = useState<LabFilter>({});
  /** The ticked rows, or null for the top 8. */
  const [ticks, setTicks] = useState<ReadonlySet<string> | null>(null);
  const [rows, setRows] = useState<LabRow[]>([]);

  // The whole grid at this depth and pack, unless the session has it already. Each request gets
  // a fresh worker: a synchronous one can't see a newer message mid-run.
  useEffect(() => {
    const kept = recall(depth, pack, keys);
    if (kept.length === keys.length) {
      setRows(kept);
      return;
    }
    setRows([]);
    const worker = new Worker(new URL('../features/delve/lab/lab-worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<LabRow[]>) => {
      remember(depth, pack, e.data);
      setRows((prev) => [...prev, ...e.data]);
    };
    worker.postMessage({ depth, pack } satisfies DpsOptions);
    return () => {
      worker.onmessage = null;
      worker.terminate();
    };
  }, [depth, pack, keys]);

  const groups = useMemo(() => dimGroups(grid.filter((s) => s.view === view)), [grid, view]);
  const columns = useMemo(() => groups.map((g) => g.key), [groups]);
  const ranked = useMemo(
    () => rank(rows.filter((r) => r.setup.view === view && passes(r.setup, off))),
    [rows, view, off],
  );
  const charted = ticks ?? topTicks(ranked);
  const lines = ranked
    .filter((r) => charted.has(r.key))
    .map((r, i) => ({
      key: r.key,
      label: Object.values(r.setup.dims).join(' · '),
      color: lineColor(colorBy, r, i, groups),
      series: r.result.series,
    }));

  const pickView = (v: View) => {
    setView(v);
    setColorBy(BY_LINE);
    setTicks(null);
  };
  const toggleChip = (key: string, value: string) => {
    const now = off[key] ?? [];
    setOff({
      ...off,
      [key]: now.includes(value) ? now.filter((v) => v !== value) : [...now, value],
    });
    setTicks(null);
  };
  // One tick handler for the page's life, so the table's memoised rows don't all re-render.
  const chartedNow = useRef(charted);
  useLayoutEffect(() => {
    chartedNow.current = charted;
  });
  const tick = useCallback((key: string) => {
    const next = new Set(chartedNow.current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTicks(next);
  }, []);

  return (
    <div className="delve-page bg-black" data-testid="delve-lab">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 px-3 py-2">
        <button
          type="button"
          className="delve-btn px-2.5 py-1.5 text-sm"
          onClick={() => navigate('/delve/training')}
          data-pad-back
          data-testid="lab-back"
        >
          ◂ Training
        </button>
        <div className="flex gap-1 rounded-xl bg-black/30 p-1" role="tablist" data-pad-tabs>
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => pickView(v)}
              className="delve-display rounded-lg px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
              style={{
                background: view === v ? 'linear-gradient(180deg,#2c2c3e,#1f1f2c)' : 'transparent',
                color: view === v ? '#fde68a' : '#8a8a9a',
              }}
              data-testid={`lab-tab-${v}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-300">
          Depth
          <input
            type="range"
            min={1}
            max={MAX_DEPTH}
            value={slider}
            onChange={(e) => setSlider(Number(e.target.value))}
            onPointerUp={(e) => setDepth(Number(e.currentTarget.value))}
            onKeyUp={(e) => setDepth(Number(e.currentTarget.value))}
            data-testid="lab-depth"
          />
          <b className="w-5 text-right text-stone-100">{slider}</b>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          <input
            type="checkbox"
            checked={pack}
            onChange={(e) => setPack(e.target.checked)}
            data-testid="lab-pack"
          />
          Pack of 5
        </label>
        <label className="flex items-center gap-1.5 text-xs text-stone-300">
          Colour by
          <select
            className={SELECT}
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value)}
            data-testid="lab-color"
          >
            <option value={BY_LINE}>Line</option>
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-1 px-3 py-2">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1">
            <span className="w-16 shrink-0 text-[10px] uppercase tracking-widest text-stone-500">
              {g.key}
            </span>
            {g.values.map((v) => (
              <Chip
                key={v}
                pressed={!off[g.key]?.includes(v)}
                onClick={() => toggleChip(g.key, v)}
                testId={`lab-chip-${g.key}-${v}`}
              >
                {v}
              </Chip>
            ))}
          </div>
        ))}
      </div>

      {rows.length < keys.length && (
        <div
          className="mx-3 h-1 overflow-hidden rounded-full bg-white/10"
          data-testid="lab-progress"
        >
          <div
            className="h-full bg-amber-400"
            style={{ width: `${(rows.length / keys.length) * 100}%` }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <LabChart lines={lines} />
        <LabTable rows={ranked} columns={columns} ticked={charted} onTick={tick} />
      </div>
    </div>
  );
}
```

`Chip` is the Anvil's own pill button (`AbilitiesPanel.tsx`), `MAX_DEPTH` (30) the sandbox store's, and the tabs use the Training panel's markup (`role="tab"` in a `data-pad-tabs` list), so LB/RB step them on a controller. The slider commits on `pointerup` and `keyup`, reading the input's own value.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveLab.test.tsx && npx tsc --noEmit -p .)`
Expected: 5 PASS (the file in well under a second); no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/lab/lab-worker.ts packages/client/src/pages/DelveLab.tsx packages/client/src/pages/__tests__/DelveLab.test.tsx
git add packages/client/src/features/delve/lab/lab-worker.ts packages/client/src/pages/DelveLab.tsx packages/client/src/pages/__tests__/DelveLab.test.tsx
git commit -m "feat(client): the DPS Lab page and its worker" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The way in, in dev builds only

`DEV_LAB` is made at module scope from `import.meta.env.DEV`, so Vite's production build (where `DEV` is the constant `false`) drops the lazy import, and with it the page's chunk and its worker. The Training Grounds' button lives beside it as `LabButton`, gated on the same constant, so its test renders the button alone (the Training Grounds page pulls in Pixi).

**Files:**
- Create: `packages/client/src/features/delve/lab/dev-routes.tsx`
- Create: `packages/client/src/features/delve/lab/__tests__/dev-routes.test.tsx`
- Modify: `packages/client/src/App.tsx:1,12,38` (CRLF, not Prettier-clean at HEAD: hand-edit, keep CRLF, never format)
- Modify: `packages/client/src/components/AppShell.tsx:27-28`
- Modify: `packages/client/src/pages/DelveTraining.tsx:21,137-138`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/features/delve/lab/__tests__/dev-routes.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

/** `DEV_LAB` is made at module scope: import the module afresh under each setting. */
async function devRoutes() {
  vi.resetModules();
  return import('../dev-routes');
}

describe('dev-routes', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('in dev: the lab page exists, and the DPS Lab button goes there', async () => {
    const { DEV_LAB, LabButton } = await devRoutes();
    expect(DEV_LAB).not.toBeNull();
    render(
      <MemoryRouter initialEntries={['/delve/training']}>
        <Routes>
          <Route path="/delve/training" element={<LabButton />} />
          <Route path="/delve/lab" element={<div data-testid="lab-page" />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId('training-lab'));
    expect(screen.getByTestId('lab-page')).toBeInTheDocument();
  });

  it('outside dev: neither the page nor the button', async () => {
    vi.stubEnv('DEV', false);
    const { DEV_LAB, LabButton } = await devRoutes();
    expect(DEV_LAB).toBeNull();
    render(
      <MemoryRouter>
        <LabButton />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('training-lab')).toBeNull();
  });
});
```

(`vi.resetModules()` resets the source modules only; React and React Router are external, so the test's `MemoryRouter` and the fresh module share one router context.)

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab/__tests__/dev-routes.test.tsx)`
Expected: the file FAILS, no tests run: 'Failed to resolve import "../dev-routes" from "src/features/delve/lab/__tests__/dev-routes.test.tsx". Does the file exist?'

- [ ] **Step 3: The dev-only route and button**

Create `packages/client/src/features/delve/lab/dev-routes.tsx`:

```tsx
import { lazy } from 'react';
import { useNavigate } from 'react-router';

/**
 * The DPS Lab page, in dev builds only; null otherwise. It is made here at
 * module scope, so a production build drops the page, its chunk and its worker.
 * (`lazy` wants a default export; the pages export by name.)
 */
export const DEV_LAB = import.meta.env.DEV
  ? lazy(() => import('../../../pages/DelveLab').then((m) => ({ default: m.DelveLab })))
  : null;

/** The Training Grounds' way into the DPS Lab: nothing outside dev builds. */
export function LabButton() {
  const navigate = useNavigate();
  if (!DEV_LAB) return null;
  return (
    <button
      type="button"
      className="delve-btn pointer-events-auto px-2.5 py-1.5 text-sm"
      onClick={() => navigate('/delve/lab')}
      aria-label="DPS Lab"
      data-testid="training-lab"
    >
      📈<span className="hidden sm:inline"> DPS Lab</span>
    </button>
  );
}
```

(On the scratch copy, making `DEV_LAB` ignore `DEV` fails the second test, so the gate is what it checks.)

- [ ] **Step 4: Wire it in**

`packages/client/src/App.tsx` (CRLF: edit by hand, never format):
- before the first line, `import { Routes, Route, Navigate, useParams } from 'react-router';`, add `import { Suspense } from 'react';`;
- after `import { DelveTraining } from './pages/DelveTraining';` add `import { DEV_LAB } from './features/delve/lab/dev-routes';`;
- after `        <Route path="/delve/training" element={<DelveTraining />} />` add

```tsx
        {DEV_LAB && (
          <Route
            path="/delve/lab"
            element={
              <Suspense fallback={null}>
                <DEV_LAB />
              </Suspense>
            }
          />
        )}
```

`packages/client/src/components/AppShell.tsx`: the two lines

```tsx
  // The Delve arena is full-screen: the joystick and ability buttons need the space.
  const hideTabBar = location.pathname === '/delve/run' || location.pathname === '/delve/training';
```

become

```tsx
  // Full screen: the Delve arena (its joystick and ability buttons need the space) and the DPS Lab.
  const hideTabBar = ['/delve/run', '/delve/training', '/delve/lab'].includes(location.pathname);
```

`packages/client/src/pages/DelveTraining.tsx`:
- after `import { MeterChip } from '@/features/delve/training/MeterView';` add `import { LabButton } from '@/features/delve/lab/dev-routes';`;
- in the top bar, the lines

```tsx
              <MeterChip meter={arena.meter} onReset={arena.actions.resetMeter} />
            </div>
```

become

```tsx
              <MeterChip meter={arena.meter} onReset={arena.actions.resetMeter} />
            </div>
            <LabButton />
```

so the button sits between the meter and the ☰ Panel toggle (icon-only on phones). E2E T01 checks that the meter chip stays between the back button and the toggle; on the scratch copy it passed on all four devices, and on an iPhone SE the chip ends at x 250, the 📈 button spans 267–313 and the toggle starts at 322.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; 88 files, 650 tests, all green (the two new dev-routes tests included).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/lab/dev-routes.tsx packages/client/src/features/delve/lab/__tests__/dev-routes.test.tsx packages/client/src/components/AppShell.tsx packages/client/src/pages/DelveTraining.tsx
git add packages/client/src/features/delve/lab/dev-routes.tsx packages/client/src/features/delve/lab/__tests__/dev-routes.test.tsx packages/client/src/App.tsx packages/client/src/components/AppShell.tsx packages/client/src/pages/DelveTraining.tsx
git commit -m "feat(client): reach the DPS Lab from the Training Grounds, in dev builds only" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Chunk 5: Release

### Task 7: Look at it

The validator checks colours, not layout: run the lab in the dev server and look at it.

**Files:**
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/lab-shots.spec.ts`

- [ ] **Step 1: The screenshot pass**

Create the scratch config (header). The 5288 dev server must be running with the new engine (Task 2 restarted it; run the header block again if in doubt; expect `True`).

Create `packages/client/e2e/lab-shots.spec.ts` (scratch: never committed):

```ts
import { test, expect } from '@playwright/test';

/**
 * SCRATCH (DPS Lab plan, Task 7): never committed. Runs the lab's grid in the
 * dev server and saves screenshots to SHOTS_DIR: a folder in your scratchpad,
 * never the repo.
 */
const OUT = process.env.SHOTS_DIR;
if (!OUT) throw new Error('Set SHOTS_DIR to a folder in your scratchpad');

test('DPS Lab shots', async ({ page }, info) => {
  const name = info.project.name;
  const shot = (what: string) => page.screenshot({ path: `${OUT}/${name}-${what}.png` });
  const done = () => expect(page.getByTestId('lab-progress')).toHaveCount(0, { timeout: 90_000 });

  let t = Date.now();
  await page.goto('/delve/lab');
  await expect(page.getByTestId('delve-lab')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Home')).toHaveCount(0); // no TabBar
  await done();
  console.log(`${name}: the grid on one dummy in ${Date.now() - t} ms`);
  await shot('basics');
  const chart = page.getByRole('img', { name: 'DPS over time' });
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await expect(page.getByTestId('lab-readout-time')).toContainText('DPS at');
  await shot('hover');
  await page.getByTestId('lab-table').scrollIntoViewIfNeeded();
  await shot('table');

  await page.getByTestId('lab-tab-ability').click();
  await page.getByTestId('lab-chip-payment-cast').click();
  await chart.scrollIntoViewIfNeeded();
  await shot('abilities');
  await page.getByTestId('lab-row').last().scrollIntoViewIfNeeded();
  await expect(page.getByTestId('lab-row').last()).toContainText("can't afford");
  await shot('last');
  await page.selectOption('[data-testid="lab-color"]', 'first');
  await chart.scrollIntoViewIfNeeded();
  await shot('colour-first');

  t = Date.now();
  await page.getByTestId('lab-pack').check();
  await expect(page.getByTestId('lab-progress')).toBeVisible();
  await done();
  console.log(`${name}: the grid on the pack in ${Date.now() - t} ms`);
  await shot('pack');

  await page.getByTestId('lab-back').click();
  await expect(page.getByTestId('training-lab')).toBeVisible({ timeout: 30_000 });
  await shot('training');
});
```

(It checks the crosshair through its readout: a vertical SVG `line` has a zero-width box, which Playwright never counts as visible.)

Run, with `<scratchpad>` your session's scratchpad directory (forward slashes): `(cd packages/client && SHOTS_DIR="<scratchpad>/lab-shots" npx playwright test -c playwright.scratch.config.ts --project=desktop --project=iphone-se e2e/lab-shots.spec.ts)`
Expected: 2 passed; 8 PNGs per device in `<scratchpad>/lab-shots/`, none in the repo. The logs show the grid taking about 2–3.5 s on one dummy and 5–7 s on the pack (dev-mode React, two browsers at once).

- [ ] **Step 2: Look at them**

View them with the Read tool and check:
- `basics`: no TabBar; one top bar (◂ Training, BASICS | ABILITIES, Depth 10, Pack of 5, Colour by Line), wrapping onto more lines on the phone; three rows of gold chips (weapon, primary, secondary); a chart panel 240 px tall with small grey labels (0.0, a middle line, the top; 0s to 30s) and 8 coloured lines, jagged in the first seconds (running averages that front-load) and clipped at the top edge there; under it the legend, each line's DPS first, then its dimensions (`maul · shadow · nature`);
- `hover`: a pale vertical crosshair and "DPS at N s", each line's value at that moment;
- `table`: the rows ranked by DPS, the top 8 ticked, amber bars shrinking from the top row's full width;
- `abilities`: five chip rows (form, first, second, weight, payment), the cast chip dark (off);
- `last`: the bottom of the Abilities table: greyed "can't afford" rows, the Heavy and Crushing mana-paid Ultimates;
- `colour-first`: lines in their element's own colour (the colour-by select reads `first`);
- `pack`: Pack of 5 ticked, far larger numbers, area forms (Burst, Nova…) up the table;
- `training`: the Training Grounds' top bar on one line: ◂, Depth, the meter chip, 📈 ("📈 DPS Lab" on desktop), ☰.

If something doesn't read, tune only its cosmetic numbers (sizes, classes, colours) in `LabChart.tsx`, `LabTable.tsx` or `DelveLab.tsx`, keep `(cd packages/client && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)` green, and reshoot. Commit each fix:

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/lab/LabChart.tsx packages/client/src/features/delve/lab/LabTable.tsx packages/client/src/pages/DelveLab.tsx
git add packages/client/src/features/delve/lab/LabChart.tsx packages/client/src/features/delve/lab/LabTable.tsx packages/client/src/pages/DelveLab.tsx
git commit -m "fix(client): tune the DPS Lab's <what> from the screenshots" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Known and accepted: a chip click on the full Abilities view (4,320 rows) takes about half a second, all of it dev-mode React's work (the lab only ever runs in dev builds); the Basics view answers at once. Windowing the table would fix it if it ever gets in the way.

Delete `packages/client/e2e/lab-shots.spec.ts` when done (keep the scratch config for Task 8). Nothing to commit if nothing was tuned.

---

### Task 8: Docs and full verification

No version bump: the lab exists only in dev builds (production drops the page, its chunk and its worker, which Step 2 checks), and the attribution change alters no rule and nothing a player sees (the Training meter buckets by `source`, which didn't change). `packages/client/package.json` stays at `0.44.0`.

**Files:**
- Modify: `CLAUDE.md:92` (CRLF: add a bullet after it), `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md:4` (CRLF; status line)

- [ ] **Step 1: Docs**

In `CLAUDE.md`, the Delve section: after the **Training Grounds** bullet (line 92), add

```markdown
- **DPS Lab** (`/delve/lab`, dev builds only, behind the Training Grounds' 📈 button; spec: `docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md`): baseline DPS over 30 s for every basic-attack combo (weapon × primary × secondary) and every ability combo (Primary and Ultimate forms × ordered element sets × weight × payment), as a ranked table and a chart of the ticked rows. The engine's `arpg/dps-sim.ts` runs one setup on the sandbox's neutral dummies (`simulateDps`; `dpsCombos` is the only part that knows the build model, `dpsKey` names a setup): a plain common weapon at item level = depth and nothing else, full mana at the start, the button held (under an ability, basics swing on their own and feed mana), and positions held (the hero and the dummies put back after every step, knockback zeroed). It counts only the held button's own damage, by the `hit` events' `slot`: burn and poison ticks carry the slot that set their damage (`StatusState.burnSlot`/`poisonSlot`), Overload and Combust splash the triggering hit's. The page (`pages/DelveLab.tsx`, `features/delve/lab/`) runs the grid in a fresh worker per request and keeps results for the session; `lab/dev-routes.tsx` makes the lazy route (`DEV_LAB`) at module scope, so production builds drop it.
```

In the spec, `**Status:** Draft.` becomes `**Status:** Built (dev builds only; no version bump).`

- [ ] **Step 2: Full verification**

Run, and check each is green before claiming anything:
- `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`: 72 files, 1153 tests (the pacing gate included); no type errors.
- `(cd packages/engine && pnpm build)`, then restart the 5288 dev server (header block; `True`).
- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`: 88 files, 650 tests.
- `(pnpm -F @alloy/client build)`, then `(cd packages/client && ls dist/assets | grep -ci lab; grep -l "can't afford\|lab-progress\|lab-worker\|training-lab" dist/assets/*.js)`: the first prints `0`, the second prints nothing (no lab chunk, no lab worker, none of the page's strings: production dropped it). `dist/` is git-ignored.
- `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`: all pass on the four device projects (T01 on every device checks the Training Grounds' top bar with the new button).

Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 3: Commit**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-28-delve-dps-lab-design.md
git commit -m "docs: the DPS Lab in the Delve notes" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`git status` must show nothing of this work left: only the three untracked 2026-05-01 plan docs. Don't push: the controller pushes after a final review.
