# Delve Infusion Visuals Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a spell mixes two mana types (or a weapon carries an infusion), its second element is drawn as that element's motif on whatever carries it, and marks the pixel floor where an infused line or blast passes, with a Training Grounds picker to preview basic-attack infusions.

**Architecture:** The engine only adds display data: `beam`, `slash`, `explode` and `dash` events gain `infusion` (the ability's second element, the weapon's for a basic burst, null for ticks, monsters and reactions), and `HeroWeapon` gains `infusion`, set from `HeroStatsExtra.basicInfusion` for the preview. On the client a new motif library (`arena/fx/infusion.ts`: `drawInfusion(layers, element, shape, time, seed, strength, budget)`, 6 elements × orb/path/ring, deterministic through `hash`) is driven by one infusion pass that runs after all other drawing and shares a per-frame element budget: `ManaFx` draws the transient carriers first (finisher discharges, blasts, beams and sweeps, blink trails), then `drawInfusions` in `draw-world.ts` draws the persistent ones (the hero's aura, projectiles, lobs, zones). The pixel floor gets a `growth` / `growthTarget` field pair (the nature brush) and `applyArenaEvent` stamps each infusion's brush along paths and round blast rims.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), PixiJS 8 (Graphics faked in tests), React 19, Zustand 5, Zod 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md`. Read it first; it is the requirements.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management). Run any Python helper script from a file (not a heredoc) with `PYTHONIOENCODING=utf-8`.
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (the `git commit` blocks below show only the subject and body; add the trailer).
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out.
- Push only at the very end, with `git push -q origin claude/alloy-loot-gear-system-6upsy5`. Never open a PR.
- After any engine `src` edit, rebuild with `pnpm -F @alloy/engine build` before any client check or dev server: the client consumes the built engine. Restart the dev server after an engine build (Vite can serve a stale bundle).
- `tests/delve-pacing.test.ts` must still pass unchanged: nothing here changes a hit, a cooldown or a drop.
- Format only the `.ts`/`.tsx` files you touched: `npx prettier --write <files>` (never a folder); the commit steps show it. Never run Prettier on the JSON data files or on Markdown.
- Client store tests live in `src/stores/` (not `__tests__`).
- Motifs never call `Math.random` (the tests forbid it); every random choice goes through `hash` from `mana-pixels.ts`. The rest of the FX and the pixel floor may still use it.
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe that doesn't fight back.

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `cd packages/engine && npx vitest run tests/<file>.test.ts` |
| All engine tests | `cd packages/engine && npx vitest run` |
| Engine typecheck | `cd packages/engine && npx tsc --noEmit -p .` |
| Engine build | `pnpm -F @alloy/engine build` |
| Client typecheck + tests | `cd packages/client && npx tsc --noEmit -p . && npx vitest run` |
| One client test file | `cd packages/client && npx vitest run <path>` |
| E2E / screenshots | `cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>` |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (used in Tasks 10 and 11; create it when needed, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`

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

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/delve.ts` | `HeroWeapon.infusion` |
| `src/delve/hero-stats.ts` | `HeroStatsExtra.basicInfusion`; `computeHeroStats` sets `weapon.infusion` (null unarmed or when equal to the weapon's element) |
| `src/types/arpg.ts` | `beam`, `slash`, `explode`, `dash` events gain `infusion: ManaType \| null` |
| `src/arpg/abilities/impact.ts` | `impact`'s `explode`: `ab.elements[1]`, null for a tick |
| `src/arpg/abilities/forms.ts` | Lance's `beam`, Strike's `slash`, Blink's `dash` |
| `src/arpg/basic.ts` | `burstShot`'s `explode`: the weapon's infusion |
| `src/arpg/combat.ts` | Overload, Combust, Hellfire Brand explodes: null |
| `src/arpg/step.ts` | monster slam explodes: null |
| `tests/delve-infusion.test.ts` (new) | every engine test for this feature |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `package.json` | version `0.42.0` |
| `src/features/delve/arena/fx/infusion.ts` (new) | the motif library: shapes, layers, budget, `eventSeed`, `drawInfusion`, 6 × 3 motifs |
| `src/features/delve/arena/fx/__tests__/infusion.test.ts` (new) | its tests (recording fake Graphics) |
| `src/features/delve/arena/fx/mana-fx.ts` | `Swing`/`Beam` gain `infusion` + `seed`; `infuse()` and the `infusions` list; `draw(layers, dt, time, budget)` ends with the first-priority motifs; `clear()` empties the list |
| `src/features/delve/arena/fx/draw-world.ts` | `zoneFade` and `lobAt` (shared with the motifs); `drawInfusions` (aura, projectiles, lobs, zones) |
| `src/features/delve/arena/fx/__tests__/mana-fx.test.ts` | the new `draw` signature; infused transient carriers; the persistent pass |
| `src/features/delve/arena/ArenaRenderer.ts` | events → carriers (swings, beams, finisher rings, blasts, blink trails); the budget reset and the infusion pass, last |
| `src/features/delve/arena/pixel/world.ts` | `growth`, `growthTarget`, their stepping, the `sprout` brush |
| `src/features/delve/arena/pixel/render.ts` | `passGrowth` (vines and leaves, greener) |
| `src/features/delve/arena/pixel/arena-effects.ts` | infusion stamps on `beam`, `slash`, `dash` and blast rims |
| `src/features/delve/arena/pixel/floor-engine.ts` | `FLOOR_EVENTS` gains `beam` and `slash` (the worker, `floor-worker.ts`, needs no change: frames are plain data) |
| `src/features/delve/__tests__/pixel-world.test.ts` | fixtures gain `infusion`; growth and stamp tests |
| `src/features/delve/__tests__/floor-engine.test.ts` | fixtures gain `infusion`; beams and slashes reach the floor |
| `src/stores/sandboxStore.ts` | `basicInfusion` (saved, Zod `.catch(null)`, setter ignores the weapon's element, `loadMyBuild` clears it, passed to `extra`) |
| `src/stores/sandboxStore.test.ts` | its test |
| `src/features/delve/AbilitiesPanel.tsx` | `Chip` takes `disabled` |
| `src/features/delve/training/TrainingPanel.tsx` | the **Basic infusion** picker in the Loadout tab |
| `src/features/delve/__tests__/TrainingPanel.test.tsx` | its test |
| `e2e/infusion-shots.spec.ts`, `playwright.scratch.config.ts` | scratch only: created, used, deleted, never committed |

**Docs:** `CLAUDE.md` (the Mana-pixel FX bullet gains the infusion line), the spec's status line.

---

## Chunk 1: Engine: the weapon's infusion and infused events

### Task 1: The weapon's infusion (display only)

**Files:**
- Modify: `packages/engine/src/types/delve.ts` (`HeroWeapon`)
- Modify: `packages/engine/src/delve/hero-stats.ts` (`HeroStatsExtra`, `computeHeroStats`)
- Create: `packages/engine/tests/delve-infusion.test.ts`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked (or the spec modified), commit them first so every later commit stays about code:

```bash
git add docs/superpowers/plans/2026-09-27-delve-infusion-visuals.md docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md
git commit -m "docs: Delve infusion visuals plan"
```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/delve-infusion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { gear, registry } from './fixtures/arena.js';

// The fixture arena's hero starts at (13, 36), facing up (-y).

describe('the weapon infusion (display only)', () => {
  const staff = { weapon: gear('fire', 'weapon', 'staff') };

  it("comes from extra.basicInfusion; none when unarmed or the weapon's own element", () => {
    expect(computeHeroStats(staff, registry).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, { basicInfusion: 'storm' }).weapon.infusion).toBe(
      'storm',
    );
    expect(computeHeroStats(staff, registry, { basicInfusion: 'fire' }).weapon.infusion).toBeNull();
    expect(computeHeroStats({}, registry, { basicInfusion: 'storm' }).weapon.infusion).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-infusion.test.ts`
Expected: FAIL (`weapon.infusion` is `undefined`, so `toBeNull()` fails on the first line).

- [ ] **Step 3: Implement**

In `src/types/delve.ts`, `HeroWeapon`, after the `element` field:

```ts
  /** Element of basic attacks (the weapon's mana), or null when unarmed. */
  element: ManaType | null;
```

add

```ts
  /**
   * A second element basic attacks draw as its motif (display only; hits are
   * unchanged). Null in real play until elemental affinity fills it; the
   * Training Grounds previews it through `HeroStatsExtra.basicInfusion`.
   */
  infusion: ManaType | null;
```

In `src/delve/hero-stats.ts`, `HeroStatsExtra`, after `attunement?: Partial<ManaMap>;`:

```ts
  /** A basic-attack infusion to preview (display only); ignored when unarmed or equal to the weapon's element. */
  basicInfusion?: ManaType;
```

In `computeHeroStats`, the armed weapon literal: after `element: weaponItem!.mana,` add

```ts
        infusion:
          extra.basicInfusion && extra.basicInfusion !== weaponItem!.mana
            ? extra.basicInfusion
            : null,
```

and the unarmed literal: after `element: null,` add `infusion: null,`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/engine && npx vitest run tests/delve-infusion.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors (`HeroWeapon` is built only in `computeHeroStats`).

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-infusion.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-infusion.test.ts
git commit -m "feat(engine): a weapon infusion, previewed through basicInfusion"
```

---

### Task 2: Infused events, the engine build, and the client fixtures

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`ArpgEvent`)
- Modify: `packages/engine/src/arpg/abilities/impact.ts` (`impact`)
- Modify: `packages/engine/src/arpg/abilities/forms.ts` (Lance, Strike, Blink)
- Modify: `packages/engine/src/arpg/basic.ts` (`burstShot`)
- Modify: `packages/engine/src/arpg/combat.ts` (Overload, Combust, Hellfire Brand)
- Modify: `packages/engine/src/arpg/step.ts` (`zonesTick`)
- Modify: `packages/client/src/features/delve/__tests__/floor-engine.test.ts`, `packages/client/src/features/delve/__tests__/pixel-world.test.ts` (fixtures)
- Test: `packages/engine/tests/delve-infusion.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-infusion.test.ts`, replace the imports with:

```ts
import { describe, it, expect } from 'vitest';
import { hitMonster, killMonster, makeCtx } from '../src/arpg/combat.js';
import { impact } from '../src/arpg/abilities/impact.js';
import { computeHeroStats, type HeroStatsExtra } from '../src/delve/hero-stats.js';
import type { ArpgEvent } from '../src/types/arpg.js';
import type { ManaType } from '../src/types/mana.js';
import { STEP, arena, dummy, gear, press, registry, run } from './fixtures/arena.js';
```

Below the imports (above the existing `describe`), add:

```ts
type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;
function only<K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K): Of<K>[] {
  return events.filter((e): e is Of<K> => e.kind === kind);
}

const CASES = [
  { slot: 0, form: 'lance', kind: 'beam' },
  { slot: 0, form: 'strike', kind: 'slash' },
  { slot: 0, form: 'bolt', kind: 'explode' },
  { slot: 1, form: 'blink', kind: 'dash' },
  { slot: 2, form: 'nova', kind: 'explode' },
] as const;

/** Cast the case's form, built from `elements`, at a foe 2 units above the hero, and let it land. */
function cast(c: (typeof CASES)[number], elements: ManaType[]): ArpgEvent[] {
  const build = { form: c.form, elements, payment: 'mana' as const };
  const w = arena([dummy(13, 34)], {
    noBasic: true,
    primary: c.slot === 0 ? build : undefined,
    defensive: c.slot === 1 ? build : undefined,
    ultimate: c.slot === 2 ? build : undefined,
  });
  return [...press(w, c.slot, { x: 13, y: 34 }), ...run(w, 1)];
}
```

and append:

```ts
describe('ability events carry the infusion', () => {
  it.each(CASES)('$form: its $kind carries the second element, and null with one', (c) => {
    const infused = only(cast(c, ['fire', 'storm']), c.kind);
    const plain = only(cast(c, ['fire']), c.kind);
    expect(infused.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    for (const e of infused) expect(e.infusion).toBe('storm');
    for (const e of plain) expect(e.infusion).toBeNull();
  });

  it("a tick impact's explode (an ember) carries null; the same impact landing carries it", () => {
    const w = arena([dummy(13, 30)], { noBasic: true, primary: { elements: ['fire', 'storm'] } });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    impact(ctx, w.hero.abilities[0], 13, 30, 1.1, 1, { tick: true });
    impact(ctx, w.hero.abilities[0], 13, 30, 1.1, 1);
    expect(only(events, 'explode').map((e) => e.infusion)).toEqual([null, 'storm']);
  });

  it('monster slams, Overload, Combust and Hellfire Brand carry null', () => {
    const w = arena([dummy(13, 30), dummy(14, 30)], { noBasic: true });
    const events: ArpgEvent[] = [];
    const ctx = makeCtx(registry, w, events);
    const [a, b] = w.monsters;
    a.status.burnUntil = w.t + 5;
    hitMonster(ctx, a, 1, 'storm', { source: 'skill' }); // Overload
    b.status.poisonUntil = w.t + 5;
    b.status.poisonStacks = 2;
    hitMonster(ctx, b, 1, 'fire', { source: 'skill' }); // Combust
    a.status.brandUntil = w.t + 5;
    killMonster(ctx, a); // Hellfire Brand
    w.zones.push({
      id: 999,
      owner: 'monster',
      source: null,
      ability: null,
      x: 13,
      y: 36,
      radius: 2,
      born: w.t,
      until: w.t + 1,
      tick: 0,
      nextTick: 0,
      damage: 1,
      element: 'fire',
      applies: [],
      detonateAt: w.t,
      dead: false,
    }); // a boss slam, landing next tick
    events.push(...run(w, STEP));
    const explodes = only(events, 'explode');
    expect(explodes).toHaveLength(4);
    for (const e of explodes) expect(e.infusion).toBeNull();
  });
});
```

and inside the existing `describe('the weapon infusion (display only)', …)`, after its first `it`, add:

```ts
  it("the staff's great orb bursts with it, and every hit lands the same", () => {
    const shoot = (extra: HeroStatsExtra) => {
      const w = arena([dummy(13, 30), dummy(13.7, 30)], { equipped: staff });
      w.hero.stats = computeHeroStats(staff, registry, extra);
      w.hero.attackCount = 2; // the string's third blow: the great orb
      w.hero.lastBasicAt = 0;
      const events = run(w, 2);
      return { bursts: only(events, 'explode'), hits: only(events, 'hit').map((e) => e.amount) };
    };
    const plain = shoot({});
    const infused = shoot({ basicInfusion: 'storm' });
    expect(plain.bursts.length).toBeGreaterThan(0);
    expect(infused.bursts).toHaveLength(plain.bursts.length);
    for (const e of plain.bursts) expect(e.infusion).toBeNull();
    for (const e of infused.bursts) expect(e.infusion).toBe('storm');
    expect(infused.hits).toEqual(plain.hits);
  });
```

(Why exactly 4 explodes in the null test: Overload's blast and Combust's blast hit the other foe with `noReact`; Hellfire's hit on `b` finds it neither poisoned (Combust cleared it), chilled nor hexed, so no reaction; the burn it applies ticks as a DoT (`noReact`). Fire + storm is Plasma, which only adds `chain`, so the ability cases make no extra explodes.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-infusion.test.ts`
Expected: FAIL (every new `infusion` is `undefined`; the first-task test still passes).

- [ ] **Step 3: The event types**

In `src/types/arpg.ts`, `ArpgEvent`, replace

```ts
  | { kind: 'beam'; x: number; y: number; tx: number; ty: number; width: number; element: ManaType }
  | {
      kind: 'slash';
      x: number;
      y: number;
      dir: Vec;
      range: number;
      arc: number;
      element: ManaType;
      heft: number;
    }
```

with

```ts
  | {
      kind: 'beam';
      x: number;
      y: number;
      tx: number;
      ty: number;
      width: number;
      element: ManaType;
      /**
       * Display data: the ability's second element (the weapon's, for a basic
       * burst), drawn as its motif; null for one element, ticks, monsters and
       * reactions. The same on `slash`, `explode` and `dash`.
       */
      infusion: ManaType | null;
    }
  | {
      kind: 'slash';
      x: number;
      y: number;
      dir: Vec;
      range: number;
      arc: number;
      element: ManaType;
      heft: number;
      infusion: ManaType | null;
    }
```

replace

```ts
  | { kind: 'explode'; x: number; y: number; radius: number; element: ManaType | null }
```

with

```ts
  | {
      kind: 'explode';
      x: number;
      y: number;
      radius: number;
      element: ManaType | null;
      infusion: ManaType | null;
    }
```

and replace

```ts
  | { kind: 'dash'; fromX: number; fromY: number; toX: number; toY: number }
```

with

```ts
  | {
      kind: 'dash';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      infusion: ManaType | null;
    }
```

- [ ] **Step 4: Where the events are made**

In `src/arpg/abilities/impact.ts`, `impact`, replace

```ts
  if (!o.silent) ctx.events.push({ kind: 'explode', x, y, radius, element: ab.element });
```

with

```ts
  // A tick (a zone tick, an ember) draws no infusion.
  if (!o.silent)
    ctx.events.push({
      kind: 'explode',
      x,
      y,
      radius,
      element: ab.element,
      infusion: o.tick ? null : (ab.elements[1] ?? null),
    });
```

In `src/arpg/abilities/forms.ts`:
- Lance: replace
  ```ts
      ctx.events.push({ kind: 'beam', x: h.x, y: h.y, tx: ex, ty: ey, width, element: ab.element });
  ```
  with
  ```ts
      ctx.events.push({
        kind: 'beam',
        x: h.x,
        y: h.y,
        tx: ex,
        ty: ey,
        width,
        element: ab.element,
        infusion: ab.elements[1] ?? null,
      });
  ```
- Strike: in its `ctx.events.push({ kind: 'slash', … })`, after `heft,` add `infusion: ab.elements[1] ?? null,`.
- Blink: replace
  ```ts
      ctx.events.push({ kind: 'dash', fromX, fromY, toX: h.x, toY: h.y });
  ```
  with
  ```ts
      ctx.events.push({
        kind: 'dash',
        fromX,
        fromY,
        toX: h.x,
        toY: h.y,
        infusion: ab.elements[1] ?? null,
      });
  ```

In `src/arpg/basic.ts`, `burstShot`, replace

```ts
  ctx.events.push({ kind: 'explode', x: p.x, y: p.y, radius: p.explodeRadius, element: p.element });
```

with

```ts
  ctx.events.push({
    kind: 'explode',
    x: p.x,
    y: p.y,
    radius: p.explodeRadius,
    element: p.element,
    infusion: ctx.world.hero.stats.weapon.infusion,
  });
```

In `src/arpg/combat.ts`:
- `hitMonster`, Overload's event: after `element: 'storm',` add `infusion: null,`.
- `hitMonster`, Combust's event: after `element: 'nature',` add `infusion: null,`.
- `killMonster`, Hellfire Brand: replace
  ```ts
    ctx.events.push({ kind: 'explode', x: m.x, y: m.y, radius, element: 'fire' });
  ```
  with
  ```ts
    ctx.events.push({ kind: 'explode', x: m.x, y: m.y, radius, element: 'fire', infusion: null });
  ```

In `src/arpg/step.ts`, `zonesTick`, replace

```ts
        ctx.events.push({ kind: 'explode', x: z.x, y: z.y, radius: z.radius, element: z.element });
```

with

```ts
        ctx.events.push({
          kind: 'explode',
          x: z.x,
          y: z.y,
          radius: z.radius,
          element: z.element,
          infusion: null,
        });
```

- [ ] **Step 5: Run the engine suite**

Run: `cd packages/engine && npx vitest run && npx tsc --noEmit -p .`
Expected: PASS (the new file, and every other test including `delve-pacing.test.ts`, unchanged), no type errors.

- [ ] **Step 6: Build the engine and fix the client's event fixtures**

Run: `pnpm -F @alloy/engine build`, then `cd packages/client && npx tsc --noEmit -p .`
Expected: errors only in two test files, where `ArpgEvent` literals now miss `infusion`. Fix them:
- `src/features/delve/__tests__/floor-engine.test.ts`: in "replays explosions onto the floor", the two literals become
  ```ts
      { kind: 'explode', x: 8, y: 12, radius: 1.5, element: 'fire', infusion: null },
      { kind: 'explode', x: 18, y: 28, radius: 1.5, element: 'frost', infusion: null },
  ```
  and in "keeps only floor-relevant events…", `{ kind: 'explode', x: 1, y: 1, radius: 1, element: 'fire' },` becomes `{ kind: 'explode', x: 1, y: 1, radius: 1, element: 'fire', infusion: null },`.
- `src/features/delve/__tests__/pixel-world.test.ts`: in `explodeOnDryGround`, after `element,` add `infusion: null,`; in "electrifies connected water…", after `element: 'storm',` add `infusion: null,`.

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all client tests PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-infusion.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/abilities/impact.ts packages/engine/src/arpg/abilities/forms.ts packages/engine/src/arpg/basic.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/tests/delve-infusion.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git commit -m "feat(engine): beam, slash, explode and dash events carry the infusion"
```

---

## Chunk 2: The motif library (client)

### Task 3: `fx/infusion.ts`: six motifs in three shapes

**Files:**
- Create: `packages/client/src/features/delve/arena/fx/infusion.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts` (new)

The rules every motif keeps (the tests enforce them):
- Bright pixels go on `layers.air` (additive, above the sprites) for every carrier; the dark shapes (`SHADOW_SMOKE`, `EARTH_CRACK`) go on `layers.ground` (under the sprites), and only when the caller passes it (blasts, zones, blink trails). Shadow's smoke and wisps on the air layer use the shadow palette's purples (`color`, `deep`), never black.
- Nothing strays more than 0.8 units past the carrier (so, with pixel snapping, the tests' "shape bounds + 1.0" holds): outward lengths are at most `0.6 × reach`, reach ≤ 1.1.
- The element count is `round(density × size × strength)`: an orb's size is 1, a path's is its length, a ring's is its circumference. The budget then allows full, every other element, or nothing; what is drawn comes off it.
- Random choices hash `seed` (fixed per element: `fixed`) and `time` (re-rolled at a rate: `flick`).

- [ ] **Step 1: Write the failing tests**

Create `src/features/delve/arena/fx/__tests__/infusion.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Graphics } from 'pixi.js';
import { MANA_TYPES, type ManaType } from '@alloy/engine';
import {
  EARTH_CRACK,
  SHADOW_SMOKE,
  drawInfusion,
  eventSeed,
  type InfusionBudget,
  type InfusionShape,
} from '../infusion';

interface Rect {
  x: number;
  y: number;
  color: number;
  alpha: number;
}

/** A Graphics stand-in that records every pixel (`px` draws one rect, then fills it). */
function recorder() {
  const rects: Rect[] = [];
  let at = { x: 0, y: 0 };
  const g = {
    rects,
    rect: (x: number, y: number) => ((at = { x, y }), g),
    fill: (f: { color: number; alpha: number }) => (
      rects.push({ ...at, color: f.color, alpha: f.alpha }),
      g
    ),
  };
  return g as unknown as Graphics & { rects: Rect[] };
}

const ORB: InfusionShape = { kind: 'orb', x: 5, y: 5, r: 0.3, vx: 8, vy: -3 };
const PATH: InfusionShape = {
  kind: 'path',
  points: [
    { x: 2, y: 8 },
    { x: 5, y: 6 },
    { x: 8, y: 7 },
  ],
  width: 0.55,
  progress: 0.6,
};
const RING: InfusionShape = { kind: 'ring', x: 5, y: 5, r: 2 };
const SHAPES = [ORB, PATH, RING];
const DARK = new Set([SHADOW_SMOKE, EARTH_CRACK]);

/** Draw one motif into fresh layers (with a ground layer only when `onGround`). */
function draw(
  element: ManaType,
  shape: InfusionShape,
  o: {
    time?: number;
    seed?: number;
    strength?: number;
    budget?: InfusionBudget;
    onGround?: boolean;
  } = {},
) {
  const air = recorder();
  const ground = recorder();
  const budget = o.budget ?? { left: 1e6 };
  const before = budget.left;
  drawInfusion(
    o.onGround ? { air, ground } : { air },
    element,
    shape,
    o.time ?? 1.3,
    o.seed ?? 7,
    o.strength ?? 1,
    budget,
  );
  return { air: air.rects, ground: ground.rects, used: before - budget.left, left: budget.left };
}

/** The carrier's own extent: an orb's or a ring's disc, a path's points widened by half its width. */
function bounds(s: InfusionShape) {
  if (s.kind !== 'path') return { x0: s.x - s.r, x1: s.x + s.r, y0: s.y - s.r, y1: s.y + s.r };
  const xs = s.points.map((p) => p.x);
  const ys = s.points.map((p) => p.y);
  const w = s.width / 2;
  return {
    x0: Math.min(...xs) - w,
    x1: Math.max(...xs) + w,
    y0: Math.min(...ys) - w,
    y1: Math.max(...ys) + w,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('drawInfusion', () => {
  for (const element of MANA_TYPES)
    for (const shape of SHAPES)
      it(`${element} on a ${shape.kind}: pixels within a unit of the carrier, the same for the same seed and time`, () => {
        vi.spyOn(Math, 'random').mockImplementation(() => {
          throw new Error('motifs never use Math.random');
        });
        const b = bounds(shape);
        for (const time of [0, 0.37, 1.9]) {
          const a = draw(element, shape, { time, strength: 1.5, onGround: true });
          expect(a.air.length).toBeGreaterThan(0);
          for (const r of [...a.air, ...a.ground]) {
            expect(r.x).toBeGreaterThanOrEqual(b.x0 - 1);
            expect(r.x).toBeLessThanOrEqual(b.x1 + 1);
            expect(r.y).toBeGreaterThanOrEqual(b.y0 - 1);
            expect(r.y).toBeLessThanOrEqual(b.y1 + 1);
          }
          expect(draw(element, shape, { time, strength: 1.5, onGround: true })).toEqual(a);
        }
      });

  it('draws dark shapes only on the ground layer, and only for ground carriers', () => {
    for (const element of MANA_TYPES)
      for (const shape of SHAPES) {
        const onGround = draw(element, shape, { strength: 1.5, onGround: true });
        const inAir = draw(element, shape, { strength: 1.5 });
        expect(onGround.air.some((r) => DARK.has(r.color))).toBe(false);
        expect(inAir.air.some((r) => DARK.has(r.color))).toBe(false);
        expect(inAir.ground).toHaveLength(0);
        // Shadow's smoke and earth's cracks, under blasts, zones and trails (never under an orb).
        const dark = (element === 'shadow' || element === 'earth') && shape.kind !== 'orb';
        expect(onGround.ground.length > 0).toBe(dark);
        for (const r of onGround.ground) expect(DARK.has(r.color)).toBe(true);
      }
  });

  it('scales its element count with strength (fire: 1.6 per unit of rim)', () => {
    const used = (strength: number) => draw('fire', RING, { strength }).used;
    expect(used(0)).toBe(0);
    expect(used(0.5)).toBeGreaterThan(0);
    expect(used(1)).toBe(Math.round(1.6 * 2 * Math.PI * 2));
    expect(used(1.5)).toBeGreaterThan(used(1));
    expect(used(1)).toBeGreaterThan(used(0.5));
    expect(draw('fire', RING, { strength: 1.5 }).air.length).toBeGreaterThan(
      draw('fire', RING, { strength: 0.5 }).air.length,
    );
  });

  it('draws in full when the budget allows, every other element when half fits, else nothing', () => {
    const n = draw('frost', RING).used;
    const full = draw('frost', RING, { budget: { left: n } });
    expect(full.left).toBe(0);
    const half = draw('frost', RING, { budget: { left: Math.ceil(n / 2) } });
    expect(half.left).toBe(0);
    expect(half.air.length).toBeGreaterThan(0);
    expect(half.air.length).toBeLessThan(full.air.length);
    const none = draw('frost', RING, { budget: { left: Math.ceil(n / 2) - 1 } });
    expect(none.left).toBe(Math.ceil(n / 2) - 1);
    expect(none.air).toHaveLength(0);
  });

  it('seeds a transient carrier from where and when its event happened', () => {
    expect(eventSeed(3, 4, 1)).toBe(eventSeed(3, 4, 1));
    expect(eventSeed(3, 4, 1)).not.toBe(eventSeed(3, 4, 1.5));
    expect(eventSeed(3, 4, 1)).not.toBe(eventSeed(4, 3, 1));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/infusion.test.ts`
Expected: FAIL (`../infusion` does not exist).

- [ ] **Step 3: Implement**

Create `src/features/delve/arena/fx/infusion.ts`:

```ts
import type { Graphics } from 'pixi.js';
import type { ManaType, Vec } from '@alloy/engine';
import { MANA_HEX } from '../palette';
import { PX, hash, manaLine, px } from './mana-pixels';

/**
 * Infusion motifs. A spell that mixes two mana types keeps its first element
 * as its body and shows the second (its infusion) as that element's motif, on
 * whatever carries it: an `orb` (a projectile, a lob), a `path` (a beam, a
 * sweep, a blink trail) or a `ring` (a blast, a zone rim, an aura). Each
 * element has one motif in three shapes, so any pair works on any form. It is
 * all mana pixels on the sprites' 0.1-unit grid, and every random choice
 * hashes `seed` and `time`, so a motif is stable per carrier and never
 * shimmers (no Math.random). See the infusion visuals spec.
 */

const TAU = Math.PI * 2;

export interface OrbShape {
  kind: 'orb';
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

export interface PathShape {
  kind: 'path';
  points: Vec[];
  width: number;
  /** 0–1 as the carrier grows and fades. */
  progress: number;
}

export interface RingShape {
  kind: 'ring';
  x: number;
  y: number;
  r: number;
}

export type InfusionShape = OrbShape | PathShape | RingShape;

/**
 * The pixel layers a motif draws on. Every bright pixel goes on the additive
 * `air` layer (above the sprites); the dark shapes go on the normal-blend
 * `ground` layer (under them), which callers pass only for carriers on the
 * ground (blasts, zones, blink trails): its absence means an air carrier.
 */
export interface InfusionLayers {
  air: Graphics;
  ground?: Graphics;
}

/** The frame's allowance of motif elements, spent in the order the infusion pass draws. */
export interface InfusionBudget {
  left: number;
}

export const INFUSION_BUDGET = 600;

/** The dark shapes, drawn only on the ground layer. */
export const SHADOW_SMOKE = 0x1d1129;
export const EARTH_CRACK = 0x2b2017;
/** Light stone, so pebbles and rubble read on the additive layer. */
const STONE = 0xe8d8b4;
const STONE_DIM = 0xbfa47c;
const EMBER = 0xffc46b;

/** Elements per carrier: an orb's count, per unit of length along a path, per unit of rim round a ring. */
const DENSITY: Record<ManaType, Record<InfusionShape['kind'], number>> = {
  storm: { orb: 3, path: 1 / 1.2, ring: 0.5 },
  nature: { orb: 4, path: 1.4, ring: 0.9 },
  frost: { orb: 6, path: 2, ring: 1.4 },
  fire: { orb: 6, path: 2.2, ring: 1.6 },
  earth: { orb: 4, path: 1.5, ring: 0.8 },
  shadow: { orb: 4, path: 1.3, ring: 1.1 },
};

/** A seed for a transient carrier, from where and when its event happened. */
export function eventSeed(x: number, y: number, t: number): number {
  return hash(x * 3.7 + t * 11.3, y * 5.3 - t * 7.1);
}

/** What drawing one motif element needs: the layers, the palette, the clock and the strength's effects. */
interface Pen {
  air: Graphics;
  ground: Graphics | undefined;
  color: number;
  light: number;
  deep: number;
  time: number;
  seed: number;
  alpha: number;
  reach: number;
}

/** A point along a path, with its unit tangent and normal. */
interface PathPoint {
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
}

interface Motif {
  /** Element `i` of `n` round a moving ball. */
  orb: (p: Pen, o: OrbShape, i: number, n: number) => void;
  /** Element `i` at a point along a path. */
  path: (p: Pen, s: PathShape, at: PathPoint, i: number) => void;
  /** Element `i` at angle `a` on a rim, owning `span` radians of it. */
  ring: (p: Pen, o: RingShape, a: number, span: number, i: number) => void;
}

/** A 0..1 value fixed for element `i` of this carrier (`k` picks one of several). */
function fixed(p: Pen, i: number, k: number): number {
  return hash(i * 1.37 + k * 7.91, p.seed);
}

/** A 0..1 value for element `i`, re-rolled `rate` times a second. */
function flick(p: Pen, i: number, k: number, rate: number): number {
  return hash(i * 2.11 + k * 5.3, p.seed + Math.floor(p.time * rate) * 0.731);
}

/** `a` blended toward `b` by `k` (0x rrggbb colours). */
function mix(a: number, b: number, k: number): number {
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    return Math.round(x + (((b >> s) & 255) - x) * k) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/** A path's length, and the point at fraction `t` of it. */
function sampler(points: Vec[]): { len: number; at: (t: number) => PathPoint } {
  const pts = points.length > 1 ? points : [points[0], points[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const len = cum[cum.length - 1];
  return {
    len,
    at: (t) => {
      const d = t * len;
      let i = 1;
      while (i < pts.length - 1 && cum[i] < d) i++;
      const a = pts[i - 1];
      const b = pts[i];
      const seg = cum[i] - cum[i - 1];
      const k = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i - 1]) / seg)) : 0;
      const tx = seg > 0 ? (b.x - a.x) / seg : 0;
      const ty = seg > 0 ? (b.y - a.y) / seg : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, tx, ty, nx: -ty, ny: tx };
    },
  };
}

/** A point on a path's edge, `side` (1 or −1) of its centre line. */
function edge(s: PathShape, at: PathPoint, side: number): Vec {
  const w = (s.width / 2) * side;
  return { x: at.x + at.nx * w, y: at.y + at.ny * w };
}

/** Behind a moving orb (straight down while it stands still), and across it. */
function behind(o: OrbShape): { dx: number; dy: number; qx: number; qy: number } {
  const v = Math.hypot(o.vx, o.vy);
  const dx = v > 1e-6 ? -o.vx / v : 0;
  const dy = v > 1e-6 ? -o.vy / v : 1;
  return { dx, dy, qx: -dy, qy: dx };
}

/** Pixels stepped from (x, y) along (dx, dy) for `len` units, turning `turn` radians on the way; returns the tip. */
function curl(
  g: Graphics,
  x: number,
  y: number,
  dx: number,
  dy: number,
  len: number,
  turn: number,
  color: number,
  alpha: number,
): Vec {
  const steps = Math.max(1, Math.round(len / PX));
  let a = Math.atan2(dy, dx);
  for (let k = 0; k < steps; k++) {
    x += Math.cos(a) * PX;
    y += Math.sin(a) * PX;
    a += turn / steps;
    px(g, x, y, color, alpha * (1 - (0.5 * k) / steps));
  }
  return { x, y };
}

/** A crooked line (lightning, cracks): `k` segments whose bends `h` throws up to `bend` units sideways. */
function crooked(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: number,
  alpha: number,
  bend: number,
  k: number,
  h: (j: number) => number,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  let ax = x0;
  let ay = y0;
  for (let j = 1; j <= k; j++) {
    const off = j < k ? (h(j) - 0.5) * 2 * bend : 0;
    const bx = x0 + ((x1 - x0) * j) / k + nx * off;
    const by = y0 + ((y1 - y0) * j) / k + ny * off;
    manaLine(g, ax, ay, bx, by, color, alpha);
    ax = bx;
    ay = by;
  }
}

/** A flame tongue rising `h` units from (x, y): bright at the root, flickering sideways. */
function flame(p: Pen, x: number, y: number, h: number, i: number): void {
  const steps = Math.max(1, Math.round(h / PX));
  for (let k = 0; k < steps; k++) {
    const t = k / steps;
    const sway = Math.sin(p.time * 14 + i * 1.7 + k * 0.8) * 0.05 * t;
    px(p.air, x + sway, y - k * PX, t < 0.4 ? p.light : p.color, p.alpha * (1 - 0.7 * t));
  }
}

const MOTIFS: Record<ManaType, Motif> = {
  // Storm: jagged arcs crackling off the carrier, re-rolled about 15 times a second.
  storm: {
    orb: (p, o, i) => {
      const a = TAU * flick(p, i, 0, 15);
      const out = a + (flick(p, i, 1, 15) - 0.5) * 0.8;
      const r1 = o.r + (0.25 + 0.3 * flick(p, i, 2, 15)) * p.reach;
      const x1 = o.x + Math.cos(out) * r1;
      const y1 = o.y + Math.sin(out) * r1;
      crooked(
        p.air,
        o.x + Math.cos(a) * o.r,
        o.y + Math.sin(a) * o.r,
        x1,
        y1,
        p.light,
        p.alpha,
        0.08,
        3,
        (j) => flick(p, i, 3 + j, 15),
      );
      px(p.air, x1, y1, 0xffffff, p.alpha);
    },
    path: (p, s, at, i) => {
      const side = fixed(p, i, 0) < 0.5 ? -1 : 1;
      const tilt = (flick(p, i, 0, 15) - 0.5) * 0.9;
      const dx = at.nx * side * Math.cos(tilt) + at.tx * Math.sin(tilt);
      const dy = at.ny * side * Math.cos(tilt) + at.ty * Math.sin(tilt);
      const e = edge(s, at, side);
      const len = (0.2 + 0.3 * flick(p, i, 1, 15)) * p.reach;
      crooked(p.air, e.x, e.y, e.x + dx * len, e.y + dy * len, p.light, p.alpha, 0.07, 3, (j) =>
        flick(p, i, 2 + j, 15),
      );
      px(p.air, e.x + dx * len, e.y + dy * len, 0xffffff, p.alpha);
    },
    ring: (p, o, a, span, i) => {
      if (flick(p, i, 0, 15) < 0.25) return; // it crackles on and off
      let prev: Vec | null = null;
      for (let j = 0; j <= 4; j++) {
        const aj = a + (span * 0.7 * j) / 4;
        const rr = o.r + (j % 2 ? 0.18 : -0.06) * p.reach + (flick(p, i, 1 + j, 15) - 0.5) * 0.08;
        const q = { x: o.x + Math.cos(aj) * rr, y: o.y + Math.sin(aj) * rr };
        if (prev) manaLine(p.air, prev.x, prev.y, q.x, q.y, p.light, p.alpha);
        prev = q;
      }
    },
  },

  // Nature: a curling vine and leaf sprigs behind a ball, tendrils off a path, roots out of a rim.
  nature: {
    orb: (p, o, i) => {
      const b = behind(o);
      const x0 = o.x + b.dx * o.r;
      const y0 = o.y + b.dy * o.r;
      if (i === 0) {
        const turn = Math.sin(p.time * 4 + p.seed * TAU) * 2.2;
        curl(p.air, x0, y0, b.dx, b.dy, 0.5 * p.reach, turn, p.color, p.alpha);
        return;
      }
      const d = (0.1 + 0.4 * fixed(p, i, 0)) * p.reach;
      const side = i % 2 ? 1 : -1;
      const sway = Math.sin(p.time * 6 + i) * 0.04;
      const sx = x0 + b.dx * d + b.qx * side * 0.08;
      const sy = y0 + b.dy * d + b.qy * side * 0.08;
      px(p.air, sx, sy, p.color, p.alpha);
      px(p.air, sx + b.qx * side * (0.1 + sway), sy + b.qy * side * (0.1 + sway), p.light, p.alpha);
      px(
        p.air,
        sx + b.qx * side * (0.2 + sway) + b.dx * PX,
        sy + b.qy * side * (0.2 + sway) + b.dy * PX,
        p.light,
        p.alpha * 0.8,
      );
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // Tendrils sprout sideways and curl tighter as the carrier's progress rises.
      const len = (0.2 + 0.35 * fixed(p, i, 0)) * p.reach * Math.min(1, 0.3 + 1.5 * s.progress);
      const turn = side * (fixed(p, i, 1) < 0.5 ? 1 : -1) * (0.6 + 2.2 * s.progress);
      const tip = curl(p.air, e.x, e.y, at.nx * side, at.ny * side, len, turn, p.color, p.alpha);
      px(p.air, tip.x, tip.y, p.light, p.alpha);
      px(p.air, tip.x + at.tx * PX, tip.y + at.ty * PX, p.light, p.alpha * 0.8);
    },
    ring: (p, o, a, _span, i) => {
      const len = (0.2 + 0.35 * fixed(p, i, 0)) * p.reach;
      const tip = curl(
        p.air,
        o.x + Math.cos(a) * o.r,
        o.y + Math.sin(a) * o.r,
        Math.cos(a),
        Math.sin(a),
        len,
        (fixed(p, i, 1) - 0.5) * 2.4,
        p.color,
        p.alpha,
      );
      // A sprout at the root's tip.
      px(p.air, tip.x, tip.y - PX, p.light, p.alpha);
      px(p.air, tip.x + PX, tip.y - 2 * PX, p.light, p.alpha * (0.6 + 0.4 * Math.sin(p.time * 3 + i)));
    },
  },

  // Frost: ice shards and spikes with white tips, a rime trail, glints.
  frost: {
    orb: (p, o, i) => {
      if (i < 3) {
        const a = (TAU * i) / 3 + p.time * 5;
        const r0 = o.r + 0.1;
        const r1 = r0 + 0.22 * p.reach;
        const c = Math.cos(a);
        const s = Math.sin(a);
        manaLine(p.air, o.x + c * r0, o.y + s * r0, o.x + c * r1, o.y + s * r1, p.light, p.alpha);
        px(p.air, o.x + c * r1, o.y + s * r1, 0xffffff, p.alpha);
        return;
      }
      // The rime trail behind it.
      const b = behind(o);
      const k = ((i - 3) % 3) + 1;
      const d = o.r + k * 0.14 * p.reach;
      const off = (fixed(p, i, 0) - 0.5) * 0.2;
      px(p.air, o.x + b.dx * d + b.qx * off, o.y + b.dy * d + b.qy * off, p.light, p.alpha * (1 - k * 0.2));
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // Crystal spikes grow from both edges as the carrier's progress rises.
      const len = (0.15 + 0.35 * fixed(p, i, 0)) * p.reach * Math.min(1, 0.25 + 4 * s.progress);
      const tilt = (fixed(p, i, 1) - 0.5) * 0.7;
      const dx = at.nx * side * Math.cos(tilt) + at.tx * Math.sin(tilt);
      const dy = at.ny * side * Math.cos(tilt) + at.ty * Math.sin(tilt);
      manaLine(p.air, e.x, e.y, e.x + dx * len, e.y + dy * len, p.light, p.alpha);
      px(p.air, e.x + dx * len, e.y + dy * len, 0xffffff, p.alpha);
    },
    ring: (p, o, a, _span, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const r1 = o.r + (0.18 + 0.35 * fixed(p, i, 0)) * p.reach;
      manaLine(p.air, o.x + c * o.r, o.y + s * o.r, o.x + c * r1, o.y + s * r1, p.light, p.alpha);
      const glint = 0.5 + 0.5 * Math.sin(p.time * 9 + fixed(p, i, 1) * TAU);
      px(p.air, o.x + c * r1, o.y + s * r1, 0xffffff, p.alpha * glint);
    },
  },

  // Fire: flame tongues licking upward, and embers rising.
  fire: {
    orb: (p, o, i) => {
      if (i % 2 === 0) {
        const h = (0.15 + 0.35 * flick(p, i, 0, 12)) * p.reach;
        flame(p, o.x + (fixed(p, i, 0) - 0.5) * o.r * 1.4, o.y - o.r * 0.5, h, i);
        return;
      }
      const ph = (p.time * 1.4 + fixed(p, i, 1)) % 1;
      const x = o.x + (fixed(p, i, 2) - 0.5) * o.r * 2;
      px(p.air, x, o.y - o.r - ph * 0.6 * p.reach, EMBER, p.alpha * (1 - ph));
    },
    path: (p, s, at, i) => {
      const x = at.x + (fixed(p, i, 0) - 0.5) * s.width;
      const y = at.y + (fixed(p, i, 1) - 0.5) * s.width * 0.5;
      flame(p, x, y, (0.12 + 0.35 * flick(p, i, 0, 12)) * p.reach, i);
    },
    ring: (p, o, a, _span, i) => {
      const x = o.x + Math.cos(a) * o.r;
      const y = o.y + Math.sin(a) * o.r;
      if (i % 3 !== 2) {
        flame(p, x, y, (0.12 + 0.3 * flick(p, i, 0, 12)) * p.reach, i);
        return;
      }
      const ph = (p.time * 1.2 + fixed(p, i, 0)) % 1;
      px(p.air, x + Math.sin(p.time * 3 + i) * 0.06, y - ph * 0.6 * p.reach, EMBER, p.alpha * (1 - ph));
    },
  },

  // Earth: light stone pebbles and rubble on the air layer; cracks on the ground under ground carriers.
  earth: {
    orb: (p, o, i, n) => {
      const a = (TAU * i) / n + p.time * 3.5;
      const rr = o.r + 0.14 + 0.05 * Math.sin(p.time * 2 + i);
      const x = o.x + Math.cos(a) * rr;
      const y = o.y + Math.sin(a) * rr;
      px(p.air, x, y, i % 2 ? STONE_DIM : STONE, p.alpha, 2);
      px(p.air, x, y, 0xffffff, p.alpha * 0.5);
    },
    path: (p, s, at, i) => {
      // A rubble chunk kicked up and out, hopping as it goes.
      const ph = (p.time * 2.2 + fixed(p, i, 0)) % 1;
      const side = i % 2 ? 1 : -1;
      const off = side * (s.width * 0.25 + ph * 0.35 * p.reach);
      const lift = Math.sin(Math.PI * ph) * 0.35 * p.reach;
      const x = at.x + at.nx * off;
      const y = at.y + at.ny * off - lift;
      px(p.air, x, y, i % 3 ? STONE : STONE_DIM, p.alpha * (1 - 0.5 * ph), 2);
      if (p.ground) {
        const bend = (fixed(p, i, 1) - 0.5) * 0.2;
        manaLine(
          p.ground,
          at.x - at.tx * 0.15,
          at.y - at.ty * 0.15,
          at.x + at.tx * 0.15 + at.nx * bend,
          at.y + at.ty * 0.15 + at.ny * bend,
          EARTH_CRACK,
          0.9 * p.alpha,
        );
      }
    },
    ring: (p, o, a, _span, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      // A rock thrown outward from the rim.
      const ph = (p.time * 1.3 + fixed(p, i, 0)) % 1;
      const d = o.r + ph * 0.4 * p.reach;
      const lift = Math.sin(Math.PI * ph) * 0.25 * p.reach;
      px(p.air, o.x + c * d, o.y + s * d - lift, i % 2 ? STONE_DIM : STONE, p.alpha * (1 - 0.6 * ph), 2);
      if (p.ground) {
        // The rim cracks.
        const r0 = o.r - 0.12;
        const r1 = o.r + (0.15 + 0.25 * fixed(p, i, 1)) * p.reach;
        crooked(
          p.ground,
          o.x + c * r0,
          o.y + s * r0,
          o.x + c * r1,
          o.y + s * r1,
          EARTH_CRACK,
          0.9 * p.alpha,
          0.05,
          3,
          (j) => fixed(p, i, 2 + j),
        );
      }
    },
  },

  // Shadow: wisps and smoke in the shadow palette's purples on the air layer; dark smoke and void on the ground.
  shadow: {
    orb: (p, o, i) => {
      const b = behind(o);
      const side = (i % 2 ? 1 : -1) * 0.05 * (i >> 1);
      for (let k = 0; k < 5; k++) {
        const d = o.r * 0.6 + (k + 1) * 0.1 * p.reach;
        const wave = Math.sin(p.time * 5 + k * 0.9 + i * 2.1) * 0.1 * (k / 4) + side;
        px(
          p.air,
          o.x + b.dx * d + b.qx * wave,
          o.y + b.dy * d + b.qy * wave,
          k < 2 ? p.color : p.deep,
          p.alpha * (1 - k / 5),
        );
      }
    },
    path: (p, s, at, i) => {
      const side = i % 2 ? 1 : -1;
      const e = edge(s, at, side);
      // A smoke tendril curling up off the edge.
      const len = (0.2 + 0.3 * fixed(p, i, 0)) * p.reach;
      const turn = side * (1.2 + Math.sin(p.time * 3 + i));
      curl(p.air, e.x, e.y, at.nx * side, at.ny * side - 0.8, len, turn, p.deep, p.alpha);
      if (p.ground) {
        const x = at.x + (fixed(p, i, 1) - 0.5) * s.width;
        const y = at.y + (fixed(p, i, 2) - 0.5) * s.width;
        px(p.ground, x, y, SHADOW_SMOKE, 0.7 * p.alpha, 2);
      }
    },
    ring: (p, o, a, _span, i) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      if (i % 2 === 0) {
        // A wisp rising off the rim.
        const len = (0.15 + 0.3 * fixed(p, i, 0)) * p.reach;
        const turn = Math.sin(p.time * 3 + i) * 1.5;
        curl(p.air, o.x + c * o.r, o.y + s * o.r, c * 0.3, -1, len, turn, p.color, p.alpha);
        return;
      }
      // A void mote pulled inward across the rim.
      const ph = (p.time * 0.9 + fixed(p, i, 0)) % 1;
      const d = o.r + 0.5 * p.reach - ph * (0.5 * p.reach + o.r * 0.6);
      const x = o.x + c * d;
      const y = o.y + s * d;
      if (p.ground) px(p.ground, x, y, SHADOW_SMOKE, p.alpha * (0.4 + 0.6 * ph), 2);
      px(p.air, x, y, p.deep, p.alpha * Math.sin(Math.PI * ph));
    },
  },
};

/**
 * Draw `element`'s motif on one carrier. `strength` (0–1.5: carriers pass
 * their fade, finisher discharges draw at 1.5) scales the element count
 * (`round(base × strength)`, where the base grows with the carrier's size),
 * the alpha (`min(1, strength)`) and the reach (`× (0.8 + 0.2 × strength)`).
 * The count is checked against `budget` first: drawn in full if it fits,
 * every other element if half fits, else skipped; what is drawn comes off it.
 */
export function drawInfusion(
  layers: InfusionLayers,
  element: ManaType,
  shape: InfusionShape,
  time: number,
  seed: number,
  strength: number,
  budget: InfusionBudget,
): void {
  const s = Math.min(1.5, strength);
  if (!(s > 0)) return;
  const path = shape.kind === 'path' ? sampler(shape.points) : null;
  const size = shape.kind === 'orb' ? 1 : shape.kind === 'ring' ? TAU * shape.r : (path?.len ?? 0);
  const n = Math.round(DENSITY[element][shape.kind] * size * s);
  const stride = n <= budget.left ? 1 : Math.ceil(n / 2) <= budget.left ? 2 : 0;
  if (n <= 0 || stride === 0) return;
  const color = MANA_HEX[element];
  const p: Pen = {
    air: layers.air,
    ground: layers.ground,
    color,
    light: mix(color, 0xffffff, 0.45),
    deep: mix(color, 0x000000, 0.3),
    time,
    seed,
    alpha: Math.min(1, s),
    reach: 0.8 + 0.2 * s,
  };
  const m = MOTIFS[element];
  let drawn = 0;
  for (let i = 0; i < n; i += stride, drawn++) {
    if (shape.kind === 'orb') m.orb(p, shape, i, n);
    else if (shape.kind === 'ring')
      m.ring(p, shape, (TAU * (i + 0.4 * (fixed(p, i, 9) - 0.5))) / n, TAU / n, i);
    else if (path) m.path(p, shape, path.at((i + 0.5) / n), i);
  }
  budget.left -= drawn;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/infusion.test.ts && npx tsc --noEmit -p .`
Expected: PASS (18 motif cases plus the four rule tests), no type errors. If a bounds case fails, shorten that motif's outward length (keep it at most `0.6 × reach` past the carrier's edge) rather than loosening the test.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts
git add packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts
git commit -m "feat(client): infusion motifs for every element on orbs, paths and rings"
```

---

## Chunk 3: Carriers (client)

### Task 4: `ManaFx`: infused swings and beams, transient carriers, the new `draw`

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/mana-fx.ts`
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (only `draw`'s call site and the budget, so the build stays green; the rest is Task 6)
- Test: `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts`

- [ ] **Step 1: Write the failing tests**

In `fx/__tests__/mana-fx.test.ts`:
- Below `const G = () => …`, add:
  ```ts
  /** Both pixel layers, for `ManaFx.draw`. */
  const L = () => ({ air: G(), ground: G() });
  const B = () => ({ left: INFUSION_BUDGET });
  ```
- Add `import { INFUSION_BUDGET, type PathShape } from '../infusion';` to the imports.
- In the existing tests, every `a.draw(G(), …)`, `b.draw(G(), …)` and `fx.draw(G(), …)` becomes `….draw(L(), …, B())` (the same `dt` and `time`; e.g. `a.draw(G(), 1 / 30, 0)` becomes `a.draw(L(), 1 / 30, 0, B())`).

Append:

```ts
describe('infused transient carriers', () => {
  const TRAIL: PathShape = {
    kind: 'path',
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ],
    width: 0.4,
    progress: 0,
  };
  /** Motif elements one frame spends (the other effects spend nothing). */
  const used = (fx: ManaFx, dt: number) => {
    const budget = { left: 1e6 };
    fx.draw(L(), dt, 0, budget);
    return 1e6 - budget.left;
  };

  const CARRIERS: { name: string; add: (fx: ManaFx) => void }[] = [
    {
      name: 'a swing',
      add: (fx) => fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff, { infusion: 'storm' }),
    },
    { name: 'a beam', add: (fx) => fx.beam(0, 0, 5, 0, 0.55, 0xffffff, 'nature') },
    {
      name: 'a blast',
      add: (fx) => fx.infuse('blast', 'fire', { kind: 'ring', x: 3, y: 3, r: 1.5 }),
    },
    {
      name: 'a finisher',
      add: (fx) => fx.infuse('finisher', 'frost', { kind: 'ring', x: 1, y: 0, r: 0.9 }),
    },
    { name: 'a blink trail', add: (fx) => fx.infuse('dash', 'shadow', TRAIL) },
  ];

  it.each(CARRIERS)('keeps $name while it lasts, then lets it go', ({ add }) => {
    const fx = new ManaFx();
    add(fx);
    expect(used(fx, 0.05)).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) used(fx, 0.1);
    expect(used(fx, 0.1)).toBe(0);
  });

  it('draws no motif for a plain swing or beam', () => {
    const fx = new ManaFx();
    fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff);
    fx.beam(0, 0, 5, 0, 0.55, 0xffffff);
    expect(used(fx, 0.05)).toBe(0);
  });

  it('clear() lets every infused carrier go', () => {
    const fx = new ManaFx();
    fx.swing(0, 0, 0, Math.PI / 2, 1.6, 0xffffff, { infusion: 'storm' });
    fx.beam(0, 0, 5, 0, 0.55, 0xffffff, 'nature');
    fx.infuse('blast', 'fire', { kind: 'ring', x: 3, y: 3, r: 1.5 });
    fx.clear();
    expect(used(fx, 0.05)).toBe(0);
  });

  it('spends the budget in priority order: a finisher before a blink trail', () => {
    const fx = new ManaFx();
    fx.infuse('dash', 'shadow', TRAIL);
    fx.infuse('finisher', 'fire', { kind: 'ring', x: 0, y: 0, r: 1 });
    const layers = { air: G(), ground: G() };
    // The fire finisher at 1.5: round(1.6 × 2π × 1.5) = 15 elements; the trail's 5 no longer fit.
    const budget = { left: 16 };
    fx.draw(layers, 0.001, 0, budget);
    expect(budget.left).toBe(1);
    expect(layers.air.rects).toBeGreaterThan(0);
    expect(layers.ground.rects).toBe(0); // the trail's dark smoke was left out
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/mana-fx.test.ts`
Expected: FAIL (`fx.infuse` is not a function; `draw` treats the layers object as a Graphics).

- [ ] **Step 3: Implement**

In `fx/mana-fx.ts`:

Replace the imports

```ts
import type { Graphics } from 'pixi.js';
import type { Vec } from '@alloy/engine';
import { PX, manaArc, manaDust, manaLine, manaRing, px } from './mana-pixels';
```

with

```ts
import type { ManaType, Vec } from '@alloy/engine';
import { PX, manaArc, manaDust, manaLine, manaRing, px } from './mana-pixels';
import {
  drawInfusion,
  eventSeed,
  type InfusionBudget,
  type InfusionLayers,
  type InfusionShape,
  type PathShape,
} from './infusion';
```

In the file's doc comment, after `during a wind-up).` add ` It also holds the transient infusion carriers (fx/infusion.ts): infused swings and beams, finisher discharges, blasts and blink trails.`

In `interface Swing`, after `finisher: boolean;` add

```ts
  /** The infusion drawn along the swept arc, and its motif's seed. */
  infusion: ManaType | null;
  seed: number;
```

In `interface Beam`, after `life: number;` add

```ts
  infusion: ManaType | null;
  seed: number;
```

Below `interface Beam { … }`, add

```ts
/** A transient infusion carrier: a finisher's discharge or a blast (rings), or a blink trail (a path). */
export type InfusedKind = 'finisher' | 'blast' | 'dash';

interface Infused {
  kind: InfusedKind;
  element: ManaType;
  shape: InfusionShape;
  seed: number;
  age: number;
  life: number;
}

/** How long each transient carrier lasts, and how strongly it draws (finishers discharge at 1.5). */
const INFUSED: Record<InfusedKind, { life: number; strength: number }> = {
  finisher: { life: 0.45, strength: 1.5 },
  blast: { life: 0.45, strength: 1 },
  dash: { life: 0.4, strength: 1 },
};
```

In `class ManaFx`, after `private beams: Beam[] = [];` add

```ts
  private infusions: Infused[] = [];
  /** Display seconds so far: seeds each transient motif by when it was made. */
  private now = 0;
```

and in `clear()`, after `this.beams = [];` add `this.infusions = [];`.

In `swing(…)`, its options type `o: { heft?: number; reverse?: boolean; finisher?: boolean } = {},` becomes

```ts
    o: { heft?: number; reverse?: boolean; finisher?: boolean; infusion?: ManaType | null } = {},
```

and in its `this.swings.push({ … })`, after `finisher: !!o.finisher,` add

```ts
      infusion: o.infusion ?? null,
      seed: eventSeed(x, y, this.now),
```

Replace `beam(…)`:

```ts
  beam(x: number, y: number, tx: number, ty: number, width: number, color: number): void {
    this.beams.push({ x, y, tx, ty, width, color, age: 0, life: 0.36 });
  }
```

with

```ts
  beam(
    x: number,
    y: number,
    tx: number,
    ty: number,
    width: number,
    color: number,
    infusion: ManaType | null = null,
  ): void {
    this.beams.push({
      x,
      y,
      tx,
      ty,
      width,
      color,
      age: 0,
      life: 0.36,
      infusion,
      seed: eventSeed(x, y, this.now),
    });
  }

  /**
   * A transient infusion carrier: an infused melee finisher's discharge (a
   * ring, drawn at strength 1.5), an infused blast's rim (a ring that grows
   * with the blast's own) or a blink trail (a path). Seeded from where and
   * when it was made.
   */
  infuse(kind: InfusedKind, element: ManaType, shape: InfusionShape): void {
    const at = shape.kind === 'path' ? shape.points[0] : shape;
    this.infusions.push({
      kind,
      element,
      shape,
      seed: eventSeed(at.x, at.y, this.now),
      age: 0,
      life: INFUSED[kind].life,
    });
  }
```

Replace the whole `draw` method (from `/** Advance and draw everything into \`g\` (the air layer). */` through its closing brace, just above the class's closing brace) with:

```ts
  /**
   * Advance and draw everything: the effects on the air layer, then the
   * infusion pass's first carriers (fx/infusion.ts) in priority order:
   * finisher discharges, blasts, beams and sweeps, then blink trails. Only
   * blasts and blink trails lie on the ground, so only they get its layer.
   */
  draw(layers: Required<InfusionLayers>, dt: number, time: number, budget: InfusionBudget): void {
    const g = layers.air;
    this.now += dt;
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Drag per 60 Hz frame, so sparks slow the same at any frame rate and keep their speed when frozen.
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      px(g, p.x, p.y, p.color, Math.max(0, p.life / p.max) * 1.2, p.size);
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const r of this.rings) {
      r.life -= dt;
      const p = 1 - Math.max(0, r.life / r.max);
      const radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - p, 3));
      if (r.fill) manaDust(g, r.x, r.y, radius, r.color, time, 0.12, 1 - p, r.x * 7 + r.y);
      manaRing(g, r.x, r.y, radius, r.color, time, {
        alpha: (1 - p) * 1.1,
        thickness: p < 0.4 ? 2 : 1,
        jitter: 1,
      });
    }
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const b of this.bolts) {
      b.life -= dt;
      const a = Math.max(0, b.life / b.max);
      for (let i = 0; i < b.points.length - 1; i++) {
        const p0 = b.points[i];
        const p1 = b.points[i + 1];
        manaLine(g, p0.x, p0.y, p1.x, p1.y, b.color, 0.8 * a, { thickness: 2, jitter: 1, time });
        manaLine(g, p0.x, p0.y, p1.x, p1.y, 0xffffff, 0.9 * a, { every: 2 });
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0);

    // Infused sweeps and beams: their motifs are drawn with the others, below.
    const paths: { element: ManaType; shape: PathShape; seed: number; strength: number }[] = [];
    for (const s of this.swings) {
      s.age += dt;
      const p = Math.min(1, s.age / SWEEP_SECONDS);
      const fade = 1 - Math.max(0, (s.age - SWEEP_SECONDS) / (s.life - SWEEP_SECONDS));
      const sign = s.reverse ? -1 : 1;
      const from = s.angle - (sign * s.arc) / 2;
      const head = from + sign * s.arc * p;
      const thick = s.heft >= 0.6 ? 3 : 2;
      manaArc(g, s.x, s.y, s.range, from, head, s.color, 0.9 * fade, thick);
      // The leading edge is white-hot while it travels.
      const edge = Math.min(0.3, s.arc * 0.2);
      manaArc(g, s.x, s.y, s.range + PX, head - sign * edge, head, 0xffffff, fade, 1);
      if (s.finisher) manaArc(g, s.x, s.y, s.range + PX * 2, from, head, s.color, 0.6 * fade, 1);
      if (s.infusion)
        paths.push({
          element: s.infusion,
          shape: {
            kind: 'path',
            points: arcPoints(s.x, s.y, s.range, from, head),
            width: 0.3,
            progress: Math.min(1, s.age / s.life),
          },
          seed: s.seed,
          strength: fade,
        });
    }
    this.swings = this.swings.filter((s) => s.age < s.life);

    for (const b of this.beams) {
      b.age += dt;
      // It extends from the hand, then fades from base to tip.
      const grow = Math.min(1, b.age / 0.06);
      const fadeP = Math.max(0, (b.age - 0.06) / (b.life - 0.06));
      const tipX = b.x + (b.tx - b.x) * grow;
      const tipY = b.y + (b.ty - b.y) * grow;
      const baseX = b.x + (b.tx - b.x) * fadeP;
      const baseY = b.y + (b.ty - b.y) * fadeP;
      const thick = Math.max(1, Math.round((b.width * 2 * (1 - fadeP)) / PX));
      manaLine(g, baseX, baseY, tipX, tipY, b.color, 0.75, { thickness: thick, jitter: 1, time });
      manaLine(g, baseX, baseY, tipX, tipY, 0xffffff, 0.95, { thickness: 1 });
      // It sheds pixels as it fades (about one a frame at 60 Hz).
      if (fadeP > 0)
        for (let i = spawnCount(1, dt); i > 0 && this.particles.length < MAX_PARTICLES; i--)
          this.particles.push({
            x: baseX,
            y: baseY,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -0.8 - Math.random(),
            life: 0.4,
            max: 0.4,
            color: b.color,
            size: 1,
            drag: 0.95,
          });
      if (b.infusion)
        paths.push({
          element: b.infusion,
          shape: {
            kind: 'path',
            points: [
              { x: baseX, y: baseY },
              { x: tipX, y: tipY },
            ],
            width: b.width,
            progress: Math.min(1, b.age / b.life),
          },
          seed: b.seed,
          strength: 1 - fadeP,
        });
    }
    this.beams = this.beams.filter((b) => b.age < b.life);

    // The infusion pass starts here, with these first-priority carriers.
    for (const f of this.infusions) f.age += dt;
    const air = { air: g };
    const transient = (kind: InfusedKind, l: InfusionLayers) => {
      for (const f of this.infusions)
        if (f.kind === kind)
          drawInfusion(
            l,
            f.element,
            shapeAt(f),
            time,
            f.seed,
            INFUSED[kind].strength * Math.max(0, 1 - f.age / f.life),
            budget,
          );
    };
    transient('finisher', air);
    transient('blast', layers);
    for (const q of paths) drawInfusion(air, q.element, q.shape, time, q.seed, q.strength, budget);
    transient('dash', layers);
    this.infusions = this.infusions.filter((f) => f.age < f.life);
  }
```

At the end of the file, after `jagged`, add:

```ts
/** Points along an arc from `a0` to `a1`, about every 0.3 units (an infused sweep's path). */
function arcPoints(x: number, y: number, r: number, a0: number, a1: number): Vec[] {
  const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / 0.3));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return { x: x + Math.cos(a) * r, y: y + Math.sin(a) * r };
  });
}

/** A transient carrier's shape at its age: a blast's rim grows with its ring; a trail's progress runs. */
function shapeAt(f: Infused): InfusionShape {
  const p = Math.min(1, f.age / f.life);
  if (f.shape.kind === 'path') return { ...f.shape, progress: p };
  if (f.kind === 'blast' && f.shape.kind === 'ring')
    return { ...f.shape, r: 0.1 + (f.shape.r - 0.1) * (1 - Math.pow(1 - p, 3)) };
  return f.shape;
}
```

`ManaFx.draw`'s only caller is `ArenaRenderer.update`; move it to the new signature now (Task 6 completes the pass). In `arena/ArenaRenderer.ts`:
- after `import { ManaFx } from './fx/mana-fx';` add
  ```ts
  import { INFUSION_BUDGET, type InfusionBudget } from './fx/infusion';
  ```
- after `private readonly fx = new ManaFx();` add
  ```ts
    /** The infusion pass's per-frame allowance (fx/infusion.ts), reset every frame. */
    private readonly budget: InfusionBudget = { left: INFUSION_BUDGET };
  ```
- in `update`, `this.fx.draw(air, dt, this.time);` becomes
  ```ts
      this.budget.left = INFUSION_BUDGET;
      this.fx.draw({ air, ground }, dt, this.time, this.budget);
  ```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/arena/fx/__tests__/mana-fx.test.ts`
Expected: no type errors; PASS (the three existing tests on the new signature, and the new ones).

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git add packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): ManaFx carries infused swings, beams, blasts, finishers and blink trails"
```

---

### Task 5: The persistent carriers (`drawInfusions`)

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts`
- Test: `packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts`

- [ ] **Step 1: Write the failing test**

In `fx/__tests__/mana-fx.test.ts`, change the draw-world import to
`import { drawAnticipation, drawInfusions, drawProjectiles } from '../draw-world';`
and append:

```ts
describe('the infusion pass: persistent carriers', () => {
  const two = { elements: ['fire', 'storm'] };
  const one = { elements: ['fire'] };
  const plainHero = { x: 5, y: 5, defend: null, ward: null, abilities: [one, one], stats: { weapon: { infusion: null } } };
  const world = (over: object) =>
    ({ t: 1, projectiles: [], zones: [], hero: plainHero, ...over }) as unknown as ArpgWorld;
  /** Motif elements the pass spends on a world. */
  const used = (w: ArpgWorld) => {
    const budget = { left: 1e6 };
    drawInfusions(L(), w, 0, budget);
    return 1e6 - budget.left;
  };
  const shot = (o: object) => ({
    id: 1,
    owner: 'hero',
    form: 'bolt',
    ability: two,
    x: 3,
    y: 3,
    vx: 8,
    vy: 0,
    radius: 0.3,
    ...o,
  });

  it("draws an ability shot's second element; nothing for one element, an ember or a monster shot", () => {
    expect(used(world({ projectiles: [shot({})] }))).toBeGreaterThan(0);
    expect(used(world({ projectiles: [shot({ ability: one })] }))).toBe(0);
    expect(used(world({ projectiles: [shot({ form: 'ember' })] }))).toBe(0);
    expect(used(world({ projectiles: [shot({ owner: 'monster', form: null, ability: null })] }))).toBe(0);
  });

  it("gives a basic shot the weapon's infusion", () => {
    const basic = shot({ form: null, ability: null });
    expect(used(world({ projectiles: [basic] }))).toBe(0);
    const infused = { ...plainHero, stats: { weapon: { infusion: 'nature' } } };
    expect(used(world({ projectiles: [basic], hero: infused }))).toBeGreaterThan(0);
  });

  it("draws a fusion's lingering ground and a thrown Burst in flight, not a Barrage target", () => {
    const zone = { id: 9, owner: 'hero', source: 'plasma', ability: two, x: 8, y: 8, radius: 2, born: 0.5, until: 4, detonateAt: 0 };
    expect(used(world({ zones: [zone] }))).toBeGreaterThan(0);
    expect(used(world({ zones: [{ ...zone, ability: one }] }))).toBe(0);
    expect(used(world({ zones: [{ ...zone, owner: 'monster', ability: null }] }))).toBe(0);
    const lob = { ...zone, source: 'burst', detonateAt: 1.5, fromX: 2, fromY: 2 };
    expect(used(world({ zones: [lob] }))).toBeGreaterThan(0);
    expect(used(world({ zones: [{ ...lob, source: 'barrage' }] }))).toBe(0);
  });

  it("rings the hero with the Defensive's second element while its buff lasts", () => {
    const guarded = {
      ...plainHero,
      defend: { form: 'ward', until: 3 },
      ward: { hp: 1, max: 1 },
      abilities: [one, two],
    };
    expect(used(world({ hero: guarded }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, ward: null } }))).toBe(0); // a broken Ward
    expect(used(world({ hero: { ...guarded, defend: { form: 'blink', until: 3 } } }))).toBeGreaterThan(0);
    expect(used(world({ hero: { ...guarded, defend: { form: 'blink', until: 0.5 } } }))).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/mana-fx.test.ts`
Expected: FAIL (`drawInfusions` is not exported).

- [ ] **Step 3: Implement**

In `fx/draw-world.ts`:

Replace the first two imports

```ts
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, ManaType, Projectile, Vec } from '@alloy/engine';
```

with

```ts
import type { Graphics } from 'pixi.js';
import type { ArpgWorld, ManaType, Projectile, Vec, Zone } from '@alloy/engine';
import { drawInfusion, type InfusionBudget, type InfusionLayers } from './infusion';
```

In the file's doc comment, after `and the aim marker on the air layer.` add ` \`drawInfusions\` is the infusion pass's persistent carriers.`

Below `function progress(…) { … }`, add:

```ts
/** A lingering zone's fade: in over 0.2 s, out over its last 0.5 s. */
function zoneFade(z: Zone, t: number): number {
  return Math.min(1, (z.until - t) / 0.5, (t - z.born) / 0.2);
}

/** A thrown Burst in flight: how far along (0–1), its point on the ground, and its orb's height above it. */
function lobAt(z: Zone, t: number): { p: number; x: number; y: number; lift: number } {
  const p = progress(t, z.born, z.detonateAt);
  const fx = z.fromX ?? z.x;
  const fy = z.fromY ?? z.y;
  const height = Math.sin(Math.PI * p) * 0.25 * Math.hypot(z.x - fx, z.y - fy);
  return { p, x: fx + (z.x - fx) * p, y: fy + (z.y - fy) * p, lift: 0.3 * (1 - p) + height };
}
```

In `drawZones`, `const fade = Math.min(1, (z.until - t) / 0.5, (t - z.born) / 0.2);` becomes `const fade = zoneFade(z, t);`.

In `drawLobs`, replace

```ts
    const p = progress(w.t, z.born, z.detonateAt);
    const color = elem(z.element);
    const x = z.fromX + (z.x - z.fromX) * p;
    const y = z.fromY + (z.y - z.fromY) * p;
    const height = Math.sin(Math.PI * p) * 0.25 * Math.hypot(z.x - z.fromX, z.y - z.fromY);
```

with

```ts
    const { p, x, y, lift } = lobAt(z, w.t);
    const color = elem(z.element);
```

and `manaOrb(air, x, y - 0.3 * (1 - p) - height, 0.18, color, 0xffffff, 1);` becomes `manaOrb(air, x, y - lift, 0.18, color, 0xffffff, 1);`.

At the end of the file, add:

```ts
/** A hero shot's infusion: its ability's second element, or the weapon's for a basic shot (embers have none). */
function shotInfusion(w: ArpgWorld, p: Projectile): ManaType | null {
  if (p.owner !== 'hero' || p.form === 'ember') return null;
  return p.ability ? (p.ability.elements[1] ?? null) : w.hero.stats.weapon.infusion;
}

/** The size a hero shot draws at (see `drawProjectiles`). */
function shotRadius(p: Projectile): number {
  if (p.form === 'bolt') return p.radius;
  if (p.form === 'volley' || p.form === 'ember') return 0.15;
  return p.ability ? 0.15 : p.radius * 0.5;
}

/**
 * The infusion pass's persistent carriers, drawn after ManaFx's transient
 * ones and in priority order: the hero's Defensive aura (a ring, seeded by its
 * slot), projectiles (orbs), thrown Bursts in flight (orbs), then lingering
 * zones (their rims, the only ground carriers here).
 */
export function drawInfusions(
  layers: Required<InfusionLayers>,
  w: ArpgWorld,
  time: number,
  budget: InfusionBudget,
): void {
  const air = { air: layers.air };
  const h = w.hero;
  const aura = h.abilities[1]?.elements[1];
  if (aura && h.defend && w.t < h.defend.until && (h.defend.form !== 'ward' || h.ward)) {
    const fade = Math.min(1, (h.defend.until - w.t) / 0.3);
    drawInfusion(air, aura, { kind: 'ring', x: h.x, y: h.y - 0.3, r: 1 }, time, 1, fade, budget);
  }
  for (const p of w.projectiles) {
    const el = shotInfusion(w, p);
    if (!el) continue;
    const orb = { kind: 'orb' as const, x: p.x, y: p.y, r: shotRadius(p), vx: p.vx, vy: p.vy };
    drawInfusion(air, el, orb, time, p.id, 1, budget);
  }
  for (const z of w.zones) {
    const el = z.owner === 'hero' ? z.ability?.elements[1] : undefined;
    if (!el || z.source !== 'burst' || z.fromX === undefined) continue;
    const l = lobAt(z, w.t);
    const orb = {
      kind: 'orb' as const,
      x: l.x,
      y: l.y - l.lift,
      r: 0.18,
      vx: z.x - z.fromX,
      vy: z.y - (z.fromY ?? z.y),
    };
    drawInfusion(air, el, orb, time, z.id, 1, budget);
  }
  for (const z of w.zones) {
    const el = z.owner === 'hero' ? z.ability?.elements[1] : undefined;
    if (!el || z.detonateAt > 0) continue;
    const rim = { kind: 'ring' as const, x: z.x, y: z.y, r: z.radius };
    drawInfusion(layers, el, rim, time, z.id, zoneFade(z, w.t), budget);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/`
Expected: PASS (every fx test; `drawLobs` and `drawZones` draw exactly as before).

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts
git add packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts
git commit -m "feat(client): infusion motifs on auras, projectiles, lobs and zones"
```

---

### Task 6: The renderer: events to carriers, and the infusion pass last

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts`

No unit test (it needs a Pixi `Application`): the typecheck, the fx tests above and the screenshots pass (Task 10) cover it.

- [ ] **Step 1: Implement**

In `arena/ArenaRenderer.ts` (Task 4 already added the `INFUSION_BUDGET` import, the `budget` field and `draw`'s new call):

In the `./fx/draw-world` import list add `drawInfusions,` (after `drawGuard,`).

In `handleEvents`, replace the `case 'basic': { … }` block with:

```ts
        case 'basic': {
          this.kickCamera(e.dir, e.heft);
          if (e.melee) {
            const wpn = w.hero.stats.weapon;
            const s = wpn.combo[e.step] ?? wpn.combo[0];
            const arc = Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180);
            const range = wpn.range + (s.reach ?? 0) + 0.2;
            this.fx.swing(e.x, e.y, Math.atan2(e.dir.y, e.dir.x), arc, range, elemColor(e.element), {
              heft: e.heft,
              reverse: e.step % 2 === 1,
              finisher: e.finisher,
              infusion: wpn.infusion,
            });
            // An infused finisher discharges: a ring at the tip, or round the hero for a full circle.
            if (e.finisher && wpn.infusion) {
              const full = arc >= Math.PI * 2 - 1e-3;
              this.fx.infuse('finisher', wpn.infusion, {
                kind: 'ring',
                x: full ? e.x : e.x + e.dir.x * range,
                y: full ? e.y : e.y + e.dir.y * range,
                r: full ? range : 0.6 + e.heft * 0.6,
              });
            }
          } else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          break;
        }
```

(Ranged finishers draw no ring: the shot's orb and any burst carry the weapon's infusion.)

`case 'beam':` — `this.fx.beam(e.x, e.y, e.tx, e.ty, e.width, MANA_HEX[e.element]);` becomes

```ts
          this.fx.beam(e.x, e.y, e.tx, e.ty, e.width, MANA_HEX[e.element], e.infusion);
```

`case 'slash':` — the options `{ heft: e.heft, finisher: e.arc >= 360 },` become

```ts
            { heft: e.heft, finisher: e.arc >= 360, infusion: e.infusion },
```

`case 'explode':` — after `this.addShake(0.04 + e.radius * 0.02);` add

```ts
          if (e.infusion)
            this.fx.infuse('blast', e.infusion, { kind: 'ring', x: e.x, y: e.y, r: e.radius });
```

`case 'dash':` — after `this.fx.burst(e.toX, e.toY, this.guardColor(w), 10, 4);` add

```ts
          if (e.infusion)
            this.fx.infuse('dash', e.infusion, {
              kind: 'path',
              points: [
                { x: e.fromX, y: e.fromY },
                { x: e.toX, y: e.toY },
              ],
              width: 0.4,
              progress: 0,
            });
```

In `update`, replace

```ts
    drawAnticipation(air, this.fx, w, this.time, dt);
    this.budget.left = INFUSION_BUDGET;
    this.fx.draw({ air, ground }, dt, this.time, this.budget);
    drawAim(air, w, this.aim, this.time);
```

with

```ts
    drawAnticipation(air, this.fx, w, this.time, dt);
    drawAim(air, w, this.aim, this.time);
    // The effects, then the infusion pass (fx/infusion.ts) last, sharing one budget in priority
    // order: ManaFx's transient carriers first, then the hero's aura, projectiles, lobs and zones.
    const layers = { air, ground };
    this.budget.left = INFUSION_BUDGET;
    this.fx.draw(layers, dt, this.time, this.budget);
    drawInfusions(layers, w, this.time, this.budget);
```

(`loadFloor` already calls `this.fx.clear()`, which now empties the transient carriers too.)

- [ ] **Step 2: Verify**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all client tests PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/ArenaRenderer.ts
git add packages/client/src/features/delve/arena/ArenaRenderer.ts
git commit -m "feat(client): the arena draws infusions on every carrier, last and within budget"
```

---

## Chunk 4: The pixel floor

### Task 7: The growth brush (`growth`, `growthTarget`, `passGrowth`)

**Files:**
- Modify: `packages/client/src/features/delve/arena/pixel/world.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/render.ts`
- Test: `packages/client/src/features/delve/__tests__/pixel-world.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `__tests__/pixel-world.test.ts`:

```ts
describe('the growth brush', () => {
  it('grows in over about 15 steps, fades as its target falls, and never spreads', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) => neighborhood(pw, x, y, 4, (j) => pw.mat[j] !== MAT.WALL));
    const i = spot.y * pw.width + spot.x;
    const far = i + 8; // outside the brush's radius of 3
    pw.sprout(spot.x, spot.y, 3);
    expect(pw.growthTarget[i]).toBe(1);
    expect(pw.growth[i]).toBe(0);
    for (let s = 0; s < 7; s++) pw.step();
    expect(pw.growth[i]).toBeCloseTo(7 / 15, 5);
    for (let s = 7; s < 15; s++) pw.step();
    expect(pw.growth[i]).toBeGreaterThan(0.85);
    for (let s = 15; s < 60; s++) pw.step();
    expect(pw.growth[i]).toBeGreaterThan(0.4); // still there while the target is high
    for (let s = 60; s < 135; s++) pw.step();
    expect(pw.growth[i]).toBe(0);
    expect(pw.growthTarget[i]).toBe(0);
    expect(pw.growth[far]).toBe(0);
    expect(pw.growthTarget[far]).toBe(0);
  });

  it('draws grown cells greener', () => {
    const pw = make();
    const spot = find(pw, (_i, x, y) =>
      neighborhood(pw, x, y, 4, (j) => pw.fluid[j] === 0 && pw.mat[j] !== MAT.WALL),
    );
    const cells: number[] = [];
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) cells.push((spot.y + dy) * pw.width + spot.x + dx);
    const greenness = () => {
      const out = new Uint8ClampedArray(pw.size * 4);
      renderPixelWorld(pw, out, 1);
      return cells.reduce((sum, c) => sum + out[c * 4 + 1] - (out[c * 4] + out[c * 4 + 2]) / 2, 0);
    };
    const before = greenness();
    for (const c of cells) pw.growth[c] = 1;
    expect(greenness()).toBeGreaterThan(before);
  });
});
```

(The numbers: a stamp sets the target to 1; each step growth moves 1/15 toward the current target, then the target falls 1/120. So growth reads k/15 for the first 13 steps, meets the falling target at step 14 (≈ 0.89), follows it down (≈ 0.51 at step 60) and is 0 by step ~121.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts`
Expected: FAIL (`pw.sprout` is not a function).

- [ ] **Step 3: The fields and the brush (`world.ts`)**

In `pixel/world.ts`:

After `const MAX_RIPPLES = 140;` add

```ts
/** Growth moves this far toward its target per step (in over ~0.5 s)… */
const GROW_STEP = 1 / 15;
/** …and a target falls this much per step (from 1 to 0 in ~4 s). */
const GROW_FADE = 1 / 120;
```

In `class PixelWorld`, after

```ts
  /** Shadow blight (0–1). */
  readonly blight: Float32Array;
```

add

```ts
  /** Nature infusion's vines, as drawn (0–1): they follow `growthTarget`, and never spread or burn. */
  readonly growth: Float32Array;
  /** Where the growth is heading (0–1): a `sprout` sets it to 1, then it falls to 0. */
  readonly growthTarget: Float32Array;
```

In the constructor, after `this.blight = new Float32Array(n);` add

```ts
    this.growth = new Float32Array(n);
    this.growthTarget = new Float32Array(n);
```

In `stepFields`, add `growth,` and `growthTarget,` to the destructured fields (after `blight,`), and after

```ts
      if (trample[i] > 0) trample[i] = trample[i] < 0.01 ? 0 : trample[i] * 0.985;
```

add

```ts
      const gt = growthTarget[i];
      if (gt > 0 || growth[i] > 0) {
        const g = growth[i];
        growth[i] = g < gt ? Math.min(gt, g + GROW_STEP) : Math.max(gt, g - GROW_STEP);
        growthTarget[i] = gt > GROW_FADE ? gt - GROW_FADE : 0;
      }
```

After the `shadowBlast` method (just above `/** Molten ground under a magma zone. */`), add

```ts
  /** Nature infusion: vines grow in over the cells within `r` (see `growth`). */
  sprout(cx: number, cy: number, r: number): void {
    this.forDisc(cx, cy, r, (i) => {
      if (this.mat[i] !== MAT.WALL) this.growthTarget[i] = 1;
    });
  }
```

- [ ] **Step 4: Drawing it (`render.ts`)**

In `pixel/render.ts`, after `const WHITE: RGB = [255, 255, 255];` add

```ts
/** Per-sub-pixel scatter of the growth's leaves. */
const GROWTH_MUL = [5.37, 9.11, 12.3, 15.7];

/** A theme green pushed greener, for the nature growth. */
function greener(c: RGB): RGB {
  return [c[0] * 0.6, Math.min(255, c[1] * 1.3 + 24), c[2] * 0.6];
}
```

Above `/** Flowers, glowing fungi, crystals and runes. */`, add

```ts
/** Nature infusions' growth: wavy vines and scattered leaves, thickening as it grows in (never over fluid). */
function passGrowth(F: Frame): void {
  const { pw, out, x0, y0, vw, vh, s, RW } = F;
  const th = pw.theme;
  const W = pw.width;
  const { growth, fluid, noise } = pw;
  const vine = greener(th.grass[3]);
  const tip = greener(th.grassTip);
  const leaf = greener(th.bush[2]);
  for (let y = y0; y < y0 + vh; y++) {
    for (let x = x0; x < x0 + vw; x++) {
      const i = y * W + x;
      const g = growth[i];
      if (g < 0.04 || fluid[i] > 0.003) continue;
      const n = noise[i];
      const onVine = Math.abs(fsin(x * 0.9 + fsin(y * 0.5 + n) * 1.8)) < 0.3 * g;
      for (let sy = 0; sy < s; sy++) {
        for (let sx = 0; sx < s; sx++) {
          const h = (n * GROWTH_MUL[sx + sy * MAX_SCALE]) % 1;
          const c = onVine ? (h > 0.75 ? tip : vine) : h > 1 - 0.35 * g ? leaf : null;
          if (!c) continue;
          const o = (((y - y0) * s + sy) * RW + (x - x0) * s + sx) * 4;
          out[o] = c[0];
          out[o + 1] = c[1];
          out[o + 2] = c[2];
        }
      }
    }
  }
}
```

In `renderPixelWorld`, replace

```ts
  passFoliage(F);
  passProps(F);
```

with

```ts
  passFoliage(F);
  passGrowth(F);
  passProps(F);
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts src/features/delve/__tests__/floor-engine.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/pixel/world.ts packages/client/src/features/delve/arena/pixel/render.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git add packages/client/src/features/delve/arena/pixel/world.ts packages/client/src/features/delve/arena/pixel/render.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts
git commit -m "feat(client): a growth brush on the pixel floor: vines that grow in and fade"
```

---

### Task 8: Infusion stamps, and beams and slashes reach the floor

**Files:**
- Modify: `packages/client/src/features/delve/arena/pixel/arena-effects.ts`
- Modify: `packages/client/src/features/delve/arena/pixel/floor-engine.ts` (`FLOOR_EVENTS`)
- Test: `packages/client/src/features/delve/__tests__/pixel-world.test.ts`, `packages/client/src/features/delve/__tests__/floor-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

In `__tests__/pixel-world.test.ts`, the arena-effects import becomes

```ts
import {
  MAX_STAMPS,
  RIM_STAMPS,
  applyArenaEvent,
  arenaToCell,
} from '../arena/pixel/arena-effects';
```

and append:

```ts
/** A floor that records the brushes applied to it (in cells), for the stamp tests. */
function spyFloor() {
  const stamps: { brush: string; x: number; y: number; r: number }[] = [];
  const arcs: { x: number; y: number }[][] = [];
  const brush = (name: string) => (x: number, y: number, r: number) => {
    stamps.push({ brush: name, x, y, r });
  };
  const pw = {
    fireBlast: brush('fire'),
    frostBlast: brush('frost'),
    stormBlast: brush('storm'),
    earthImpact: brush('earth'),
    shadowBlast: brush('shadow'),
    sprout: brush('nature'),
    hitSpark: () => {},
    soulBurst: () => {},
    stormArc: (points: { x: number; y: number }[]) => {
      arcs.push(points.map((p) => ({ x: p.x, y: p.y })));
    },
  } as unknown as PixelWorld;
  return { pw, stamps, arcs };
}

describe('infusions on the pixel floor', () => {
  const at = (x: number, y: number) => arenaToCell(x, y, PPU, MARGIN);
  const gaps = (s: { x: number; y: number }[]) =>
    s.slice(1).map((p, k) => Math.hypot(p.x - s[k].x, p.y - s[k].y));

  it("marks a blast's rim with 6 stamps of the infusion, after the body's own brush", () => {
    const c = at(10, 10);
    for (const infusion of ['nature', 'frost', 'fire', 'earth', 'shadow'] as const) {
      const f = spyFloor();
      applyArenaEvent(
        f.pw,
        { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'frost', infusion },
        PPU,
        MARGIN,
      );
      expect(f.stamps[0]).toMatchObject({ brush: 'frost', x: c.x, y: c.y });
      const rim = f.stamps.slice(1);
      expect(rim).toHaveLength(RIM_STAMPS);
      for (const s of rim) {
        expect(s).toMatchObject({ brush: infusion, r: infusion === 'nature' ? 3 : 2 });
        expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeCloseTo(1.5 * PPU, 5);
      }
    }
    // Storm: one arc round the rim, closed.
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'frost', infusion: 'storm' },
      PPU,
      MARGIN,
    );
    expect(f.stamps).toHaveLength(1);
    expect(f.arcs).toHaveLength(1);
    expect(f.arcs[0]).toHaveLength(RIM_STAMPS + 1);
    expect(f.arcs[0][RIM_STAMPS]).toEqual(f.arcs[0][0]);
  });

  it('marks a lance evenly from end to end, one stamp per 4 cells and at most 12', () => {
    const long = spyFloor();
    applyArenaEvent(
      long.pw,
      { kind: 'beam', x: 5, y: 30, tx: 5, ty: 5, width: 0.55, element: 'fire', infusion: 'earth' },
      PPU,
      MARGIN,
    );
    expect(long.stamps).toHaveLength(MAX_STAMPS); // 125 cells would be 32
    expect(long.stamps[0]).toMatchObject(at(5, 30));
    expect(long.stamps[MAX_STAMPS - 1]).toMatchObject(at(5, 5));
    const g = gaps(long.stamps);
    for (const d of g) expect(d).toBeCloseTo(g[0], 5);
    const short = spyFloor();
    applyArenaEvent(
      short.pw,
      { kind: 'beam', x: 5, y: 10, tx: 5, ty: 8, width: 0.55, element: 'fire', infusion: 'fire' },
      PPU,
      MARGIN,
    );
    expect(short.stamps).toHaveLength(3); // 10 cells
  });

  it('marks a slash evenly along its arc', () => {
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      {
        kind: 'slash',
        x: 10,
        y: 10,
        dir: { x: 0, y: -1 },
        range: 2.4,
        arc: 150,
        element: 'storm',
        heft: 0.5,
        infusion: 'nature',
      },
      PPU,
      MARGIN,
    );
    const c = at(10, 10);
    expect(f.stamps).toHaveLength(8); // 12 cells out over 150°: about 31 cells of arc
    for (const s of f.stamps) expect(Math.hypot(s.x - c.x, s.y - c.y)).toBeCloseTo(12, 5);
    const g = gaps(f.stamps);
    for (const d of g) expect(d).toBeCloseTo(g[0], 5);
    expect(f.stamps.every((s) => s.y < c.y)).toBe(true); // the arc faces up, where it swung
  });

  it('marks a blink trail, beside the landing it always had', () => {
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      { kind: 'dash', fromX: 5, fromY: 20, toX: 5, toY: 16, infusion: 'frost' },
      PPU,
      MARGIN,
    );
    const frost = f.stamps.filter((s) => s.brush === 'frost');
    expect(frost).toHaveLength(6); // 20 cells
    expect(frost[0]).toMatchObject(at(5, 20));
    expect(frost[5]).toMatchObject(at(5, 16));
    expect(f.stamps.filter((s) => s.brush === 'shadow')).toHaveLength(1);
  });

  it('stamps nothing without an infusion', () => {
    const f = spyFloor();
    applyArenaEvent(
      f.pw,
      { kind: 'beam', x: 5, y: 30, tx: 5, ty: 5, width: 0.55, element: 'fire', infusion: null },
      PPU,
      MARGIN,
    );
    applyArenaEvent(
      f.pw,
      {
        kind: 'slash',
        x: 10,
        y: 10,
        dir: { x: 0, y: -1 },
        range: 2.4,
        arc: 150,
        element: 'storm',
        heft: 0.5,
        infusion: null,
      },
      PPU,
      MARGIN,
    );
    expect(f.stamps).toHaveLength(0);
    applyArenaEvent(
      f.pw,
      { kind: 'explode', x: 10, y: 10, radius: 1.5, element: 'fire', infusion: null },
      PPU,
      MARGIN,
    );
    applyArenaEvent(
      f.pw,
      { kind: 'dash', fromX: 5, fromY: 20, toX: 5, toY: 16, infusion: null },
      PPU,
      MARGIN,
    );
    expect(f.stamps.map((s) => s.brush)).toEqual(['fire', 'shadow']);
    expect(f.arcs).toHaveLength(0);
  });
});
```

In `__tests__/floor-engine.test.ts`, in `describe('snapshotArena')`, rename the test to `'keeps only floor-relevant events (infused lances and slashes too) and every moving body'`, append two events to its `events` array (after the `hit`):

```ts
      {
        kind: 'beam',
        x: 1,
        y: 1,
        tx: 4,
        ty: 1,
        width: 0.55,
        element: 'frost',
        infusion: 'nature',
      },
      {
        kind: 'slash',
        x: 2,
        y: 2,
        dir: { x: 0, y: -1 },
        range: 2.4,
        arc: 150,
        element: 'storm',
        heft: 0.5,
        infusion: 'earth',
      },
```

and `expect(snap.events.map((e) => e.kind)).toEqual(['explode', 'hit']);` becomes

```ts
    expect(snap.events.map((e) => e.kind)).toEqual(['explode', 'hit', 'beam', 'slash']);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/pixel-world.test.ts src/features/delve/__tests__/floor-engine.test.ts`
Expected: FAIL (`MAX_STAMPS` / `RIM_STAMPS` are undefined, no stamps are made, and the snapshot drops `beam` and `slash`).

- [ ] **Step 3: Implement**

Replace `pixel/arena-effects.ts` with:

```ts
import type { ArpgEvent, ManaType } from '@alloy/engine';
import type { PixelWorld } from './world';

/** Arena units → floor cells (the floor grid includes a cliff margin). */
export function arenaToCell(
  x: number,
  y: number,
  ppu: number,
  margin: number,
): { x: number; y: number } {
  return { x: Math.round((x + margin) * ppu), y: Math.round((y + margin) * ppu) };
}

type Cell = { x: number; y: number };

/** An infusion marks a path once per this many cells… */
const STAMP_SPACING = 4;
/** …at most this many times per event (spread evenly, never cut off). */
export const MAX_STAMPS = 12;
/** Marks round an infused blast's rim. */
export const RIM_STAMPS = 6;

/** Each infusion element's brush (radius in cells). Storm draws one arc through the stamps instead. */
const BRUSH: Record<Exclude<ManaType, 'storm'>, (pw: PixelWorld, c: Cell) => void> = {
  nature: (pw, c) => pw.sprout(c.x, c.y, 3),
  frost: (pw, c) => pw.frostBlast(c.x, c.y, 2),
  fire: (pw, c) => pw.fireBlast(c.x, c.y, 2),
  earth: (pw, c) => pw.earthImpact(c.x, c.y, 2),
  shadow: (pw, c) => pw.shadowBlast(c.x, c.y, 2),
};

/** Stamps along a path `len` cells long, from t = 0 to t = 1: one per 4 cells, 2 to 12. */
function along(len: number, at: (t: number) => Cell): Cell[] {
  const n = Math.min(MAX_STAMPS, Math.max(2, Math.floor(len / STAMP_SPACING) + 1));
  return Array.from({ length: n }, (_, k) => at(k / (n - 1)));
}

/** Stamps along the straight path a → b. */
function line(a: Cell, b: Cell): Cell[] {
  return along(Math.hypot(b.x - a.x, b.y - a.y), (t) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  }));
}

/** Mark the floor with an infusion's brush at each cell (storm: one arc through them, closed for a rim). */
function stamp(pw: PixelWorld, element: ManaType, cells: Cell[], closed = false): void {
  if (element === 'storm') pw.stormArc(closed ? [...cells, cells[0]] : cells);
  else for (const c of cells) BRUSH[element](pw, c);
}

/**
 * Replay one engine event onto the pixel floor as a visual effect. An
 * infusion also marks the floor with its element: along an infused lance,
 * slash or blink trail, and round an infused blast's rim (after the body's
 * own brush, so the body keeps its core). Basic swings never reach here.
 */
export function applyArenaEvent(pw: PixelWorld, e: ArpgEvent, ppu: number, margin: number): void {
  switch (e.kind) {
    case 'explode': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      const r = Math.max(3, Math.min(24, e.radius * ppu));
      switch (e.element) {
        case 'fire':
          pw.fireBlast(c.x, c.y, r);
          break;
        case 'frost':
          pw.frostBlast(c.x, c.y, r);
          break;
        case 'storm':
          pw.stormBlast(c.x, c.y, r);
          break;
        case 'earth':
          pw.earthImpact(c.x, c.y, Math.max(4, r * 0.8));
          break;
        case 'shadow':
          pw.shadowBlast(c.x, c.y, r);
          break;
        default:
          // Monster slams crack the ground.
          pw.earthImpact(c.x, c.y, Math.max(4, r * 0.6));
      }
      if (e.infusion) {
        const rim = Array.from({ length: RIM_STAMPS }, (_, k) => {
          const a = (k / RIM_STAMPS) * Math.PI * 2;
          return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
        });
        stamp(pw, e.infusion, rim, true);
      }
      break;
    }
    case 'beam':
      if (e.infusion)
        stamp(
          pw,
          e.infusion,
          line(arenaToCell(e.x, e.y, ppu, margin), arenaToCell(e.tx, e.ty, ppu, margin)),
        );
      break;
    case 'slash':
      if (e.infusion) {
        const c = arenaToCell(e.x, e.y, ppu, margin);
        const r = e.range * ppu;
        const span = (Math.min(360, e.arc) * Math.PI) / 180;
        const from = Math.atan2(e.dir.y, e.dir.x) - span / 2;
        stamp(
          pw,
          e.infusion,
          along(r * span, (t) => ({
            x: c.x + Math.cos(from + span * t) * r,
            y: c.y + Math.sin(from + span * t) * r,
          })),
        );
      }
      break;
    case 'chain':
      pw.stormArc(e.points.map((p) => arenaToCell(p.x, p.y, ppu, margin)));
      break;
    case 'hit': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      pw.hitSpark(c.x, c.y, e.element);
      break;
    }
    case 'death': {
      const c = arenaToCell(e.x, e.y, ppu, margin);
      pw.soulBurst(c.x, c.y, e.monsterKind === 'boss');
      break;
    }
    case 'dash': {
      const a = arenaToCell(e.fromX, e.fromY, ppu, margin);
      const b = arenaToCell(e.toX, e.toY, ppu, margin);
      const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 4));
      for (let s = 0; s <= steps; s++) {
        pw.hitSpark(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, 'shadow');
      }
      pw.shadowBlast(b.x, b.y, 5);
      if (e.infusion) stamp(pw, e.infusion, line(a, b));
      break;
    }
    default:
      break;
  }
}
```

In `pixel/floor-engine.ts`, replace

```ts
const FLOOR_EVENTS = new Set<ArpgEvent['kind']>(['explode', 'chain', 'hit', 'death', 'dash']);
```

with

```ts
const FLOOR_EVENTS = new Set<ArpgEvent['kind']>([
  'explode',
  'chain',
  'hit',
  'death',
  'dash',
  // Infused lances and Strikes mark the floor (see arena-effects.ts).
  'beam',
  'slash',
]);
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all client tests PASS (the existing floor tests unchanged: a plain event still draws exactly what it did).

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/client/src/features/delve/arena/pixel/arena-effects.ts packages/client/src/features/delve/arena/pixel/floor-engine.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts
git add packages/client/src/features/delve/arena/pixel/arena-effects.ts packages/client/src/features/delve/arena/pixel/floor-engine.ts packages/client/src/features/delve/__tests__/pixel-world.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts
git commit -m "feat(client): infused lances, slashes, blink trails and blasts mark the pixel floor"
```

---

## Chunk 5: Training preview, screenshots, shipping v0.42.0

### Task 9: The Basic infusion preview (store and picker)

**Files:**
- Modify: `packages/client/src/stores/sandboxStore.ts`
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx` (`Chip`)
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx` (`LoadoutTab`)
- Test: `packages/client/src/stores/sandboxStore.test.ts`, `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/stores/sandboxStore.test.ts`, inside `describe('sandboxStore')`, append:

```ts
  it("keeps a basic infusion: saved, ignored for the weapon's element, cleared by Load my build", () => {
    expect(store().basicInfusion).toBeNull();
    store().setBasicInfusion('storm');
    expect(store().basicInfusion).toBe('storm');
    expect(parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!)).basicInfusion).toBe('storm');
    expect(sandboxStats(registry, store()).weapon.infusion).toBe('storm');
    store().setBasicInfusion('fire'); // the rare fire sword's own element
    expect(store().basicInfusion).toBe('storm');
    store().setBasicInfusion(null);
    expect(store().basicInfusion).toBeNull();
    expect(parseSandbox({ basicInfusion: 'plasma' }).basicInfusion).toBeNull();
    store().setBasicInfusion('frost');
    store().loadMyBuild(createDelveProfile(registry, 7));
    expect(store().basicInfusion).toBeNull();
  });
```

In `src/features/delve/__tests__/TrainingPanel.test.tsx`, inside `describe('TrainingPanel')`, append:

```ts
  it('the Basic infusion picker writes the store, disables the weapon element, and is off unarmed', () => {
    renderPanel('loadout');
    expect(screen.getByTestId('basic-infusion-none')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('basic-infusion-fire')).toBeDisabled(); // the rare fire sword's
    fireEvent.click(screen.getByTestId('basic-infusion-storm'));
    expect(useSandboxStore.getState().basicInfusion).toBe('storm');
    expect(screen.getByTestId('basic-infusion-storm')).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByText(
        'Preview: in the Delve, basic attacks will gain a second element through elemental affinity.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('weapon-base-none'));
    expect(screen.getByTestId('basic-infusion-storm')).toBeDisabled();
    expect(screen.getByTestId('basic-infusion-none')).toBeDisabled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/client && npx vitest run src/stores/sandboxStore.test.ts src/features/delve/__tests__/TrainingPanel.test.tsx`
Expected: FAIL (`basicInfusion` is undefined; `setBasicInfusion` is not a function; no `basic-infusion-*` chips).

- [ ] **Step 3: The store**

In `src/stores/sandboxStore.ts`:
- `SandboxLoadout`, after `slowmo: number;`:
  ```ts
    /** A second element for basic attacks, previewed only (the engine ignores the weapon's own element and unarmed). */
    basicInfusion: ManaType | null;
  ```
- `SANDBOX_DEFAULTS`, after `slowmo: 1,`: `basicInfusion: null,`
- `loadoutSchema`'s object, after the `slowmo: …` entry:
  ```ts
      basicInfusion: ManaSchema.nullable().catch(null),
  ```
- `interface SandboxStore`, after `setSlowmo: (speed: number) => void;`:
  ```ts
    /** Preview a basic-attack infusion (null = none); the weapon's own element is ignored. */
    setBasicInfusion: (mana: ManaType | null) => void;
  ```
- In the store, after `setSlowmo: (slowmo) => commit({ slowmo }),`:
  ```ts
      setBasicInfusion: (basicInfusion) => {
        if (basicInfusion === null || basicInfusion !== get().weapon?.mana) commit({ basicInfusion });
      },
  ```
- `loadMyBuild`'s `commit({ … })`, after `attunement: {},`: `basicInfusion: null,`
- `StatsInput`: `'weapon' | 'loadedWeapon' | 'gear' | 'legendaries' | 'attunement' | 'depth'` becomes `'weapon' | 'loadedWeapon' | 'gear' | 'legendaries' | 'attunement' | 'depth' | 'basicInfusion'`.
- `sandboxStats`'s extra `{ legendaries: s.legendaries, attunement: s.attunement, }` gains `basicInfusion: s.basicInfusion ?? undefined,`.
- `useSandboxStats`: after `const depth = useSandboxStore((s) => s.depth);` add `const basicInfusion = useSandboxStore((s) => s.basicInfusion);`; add `basicInfusion,` to the `sandboxStats(…)` input object (after `depth,`) and to the memo's dependency list (so the arena hot-swaps when it changes): `[weapon, loadedWeapon, gear, legendaries, attunement, depth, basicInfusion]`.

(`FIELDS` is built from `SANDBOX_DEFAULTS`, so the new field is saved with the rest.)

- [ ] **Step 4: The `Chip` and the picker**

In `src/features/delve/AbilitiesPanel.tsx`, `Chip`: add `disabled,` to the destructured props, `disabled?: boolean;` to its prop type (after `title?: string;`), and on the `<button>` add

```tsx
      disabled={disabled}
      style={disabled ? { opacity: 0.35 } : undefined}
```

(A chip inside a disabled fieldset is dimmed by the fieldset and gets no style of its own.)

In `src/features/delve/training/TrainingPanel.tsx`, `LoadoutTab`: after `const choice = s.weapon;` add

```tsx
  // What the engine draws: none unarmed, or when the pick is the weapon's own element.
  const infusion = stats.weapon.infusion;
```

and between the Weapon section's closing `</Section>` and `<Section title="Legendary powers">`, add:

```tsx
      <Section title="Basic infusion">
        <fieldset
          disabled={!choice}
          className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          style={{ opacity: choice ? 1 : 0.5 }}
        >
          <Chip
            pressed={!infusion}
            onClick={() => s.setBasicInfusion(null)}
            testId="basic-infusion-none"
          >
            None
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={infusion === m}
              disabled={m === choice?.mana}
              onClick={() => s.setBasicInfusion(m)}
              testId={`basic-infusion-${m}`}
            >
              {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
            </Chip>
          ))}
        </fieldset>
        <p className="text-[11px] text-stone-500">
          Preview: in the Delve, basic attacks will gain a second element through elemental affinity.
        </p>
      </Section>
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: no type errors; all client tests PASS (the AbilitiesPanel tests unchanged).

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git add packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): preview a basic-attack infusion in the Training Grounds"
```

---

### Task 10: The screenshots pass

**Files:**
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/infusion-shots.spec.ts`
- Modify (tuning, if needed): `packages/client/src/features/delve/arena/fx/infusion.ts`, `packages/client/src/features/delve/arena/pixel/render.ts`

- [ ] **Step 1: Restart the dev server and write the scratch spec**

The engine was rebuilt in Task 2: restart the 5288 dev server (header block; expect `True`) and create the scratch config.

Create `packages/client/e2e/infusion-shots.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

/**
 * SCRATCH (Task 10 of the infusion visuals plan): never committed, deleted
 * after. Each scenario seeds a Training Grounds loadout (infused builds, a
 * basic infusion, a clump of dummies, half speed), lets the engine bot fight
 * (`alloy:delve:autopilot`), and saves crops round the hero to
 * test-results/infusion-shots/<scenario>-<n>.png for viewing.
 */
const OUT = 'test-results/infusion-shots';
const SHOTS = 16;
const EVERY_MS = 300;

const build = (form: string, elements: string[]) => ({ form, elements, weight: 0, payment: 'mana' });

const SCENARIOS = [
  {
    // Fire Bolt + storm, Ward + shadow, Maelstrom + fire; a sword's nature finisher (tip ring).
    name: 'bolt-storm_ward-shadow_maelstrom-fire',
    weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
    basicInfusion: 'nature',
    abilities: {
      primary: build('bolt', ['fire', 'storm']),
      defensive: build('ward', ['frost', 'shadow']),
      ultimate: build('maelstrom', ['storm', 'fire']),
    },
  },
  {
    // Frost Lance + nature (and its Rimebloom ground), Blink + frost, Nova + earth; staff shots + storm.
    name: 'lance-nature_blink-frost_nova-earth',
    weapon: { baseId: 'staff', mana: 'frost', rarity: 'rare' },
    basicInfusion: 'storm',
    abilities: {
      primary: build('lance', ['frost', 'nature']),
      defensive: build('blink', ['shadow', 'frost']),
      ultimate: build('nova', ['fire', 'earth']),
    },
  },
  {
    // Strike + earth, Armor + fire, Barrage + shadow; an axe's full-circle storm finisher.
    name: 'strike-earth_armor-fire_barrage-shadow',
    weapon: { baseId: 'axe', mana: 'fire', rarity: 'rare' },
    basicInfusion: 'storm',
    abilities: {
      primary: build('strike', ['storm', 'earth']),
      defensive: build('armor', ['earth', 'fire']),
      ultimate: build('barrage', ['frost', 'shadow']),
    },
  },
] as const;

async function seed(page: Page, s: (typeof SCENARIOS)[number]): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), 4242));
  const sandbox = JSON.stringify({
    weapon: s.weapon,
    loadedWeapon: null,
    gear: {},
    legendaries: {},
    attunement: {},
    abilities: s.abilities,
    depth: 5,
    dummyElement: null,
    dummies: [{ layout: 'clump', element: null }],
    toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
    slowmo: 0.5,
    basicInfusion: s.basicInfusion,
  });
  await page.addInitScript(
    ([delve, training]) => {
      if (sessionStorage.getItem('infusion-shots')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:v2', delve);
      localStorage.setItem('alloy:delve:sandbox:v1', training);
      localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('infusion-shots', '1');
    },
    [save, sandbox] as const,
  );
}

for (const s of SCENARIOS)
  test(`infusion shots: ${s.name}`, async ({ page }) => {
    await seed(page, s);
    await page.goto('/delve');
    await page.getByTestId('training-button').click();
    const canvas = page.locator('[data-testid="arena"] canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('ability-0')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(2000); // the bot reaches the dummies
    const box = (await canvas.boundingBox())!;
    const size = Math.min(560, box.width, box.height);
    const clip = {
      x: box.x + box.width / 2 - size / 2,
      y: Math.max(box.y, box.y + box.height / 2 - size / 2 - 100),
      width: size,
      height: size,
    };
    for (let n = 0; n < SHOTS; n++) {
      await page.screenshot({ path: `${OUT}/${s.name}-${String(n).padStart(2, '0')}.png`, clip });
      await page.waitForTimeout(EVERY_MS);
    }
  });
```

- [ ] **Step 2: Shoot**

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts --project desktop e2e/infusion-shots.spec.ts`
Expected: 3 passed; 48 PNGs in `packages/client/test-results/infusion-shots/`. If a scenario shows no casts, check the page's console and that the sandbox save parsed (a bad field falls back to its default: compare `localStorage['alloy:delve:sandbox:v1']` after load with what was seeded).

- [ ] **Step 3: Look, and tune**

View every PNG with the Read tool. For each spec scenario (Fire Bolt + storm, Frost Lance + nature, Strike + earth, Ward + shadow, Maelstrom + fire, an infused basic melee finisher), check:
- the motif reads as its element at a glance, and the body still reads as the first element;
- it stays on its carrier (arcs off the orb, vines along the lance, rubble along the swing, wisps round the ward, flames round the maelstrom rim);
- dark shapes (shadow smoke, earth cracks) sit under the sprites and never over them; earth's pebbles read on the additive layer;
- the finisher ring shows at the sword's tip (scenario 1) and round the hero for the axe's spin (scenario 3);
- the floor shows the marks: vines along the nature lance that grow in and fade, frost/fire/earth/shadow marks on blast rims.

Tune only numbers and colours: `DENSITY`, the outward length factors, `STONE`/`STONE_DIM`/`EMBER`, the `mix` amounts in `drawInfusion` (`infusion.ts`), and `greener`, the vine threshold `0.3 * g` or the leaf threshold `0.35 * g` (`render.ts`). After each change run
`cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__/infusion.test.ts src/features/delve/__tests__/pixel-world.test.ts`
(the bounds rule must still hold: keep outward lengths at most `0.6 × reach`), then shoot again (Step 2). Stop when every scenario reads cleanly.

- [ ] **Step 4: Clean up and commit the tuning**

Delete `packages/client/e2e/infusion-shots.spec.ts` (keep the scratch config for Task 11). If you tuned anything:

```bash
npx prettier --write packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/pixel/render.ts
git add packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/pixel/render.ts
git commit -m "fix(client): tune the infusion motifs from the screenshots"
```

(Stage only the files you changed; skip the commit when nothing changed.)

---

### Task 11: E2E, docs, version, full verification, push

**Files:**
- Modify: `CLAUDE.md` (the Mana-pixel FX bullet), `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md` (status line), `packages/client/package.json` (version)

- [ ] **Step 1: The E2E, unchanged**

Restart the 5288 dev server (header block; expect `True`).

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts`
Expected: all pass on the four device projects. A consistent failure is a regression: debug it with the page's console and state, not longer timeouts.

- [ ] **Step 2: Docs and version**

In `CLAUDE.md`, the **Mana-pixel FX** bullet: replace its ending

```markdown
shots spark at the hand and effects dissolve when they end (`fx/lifecycles.ts`). Cosmetic, so it may use `Math.random`.
```

with

```markdown
shots spark at the hand and effects dissolve when they end (`fx/lifecycles.ts`). **Infusions** (`fx/infusion.ts`; spec: `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md`): a two-element spell keeps its first element as its body and draws its second as that element's motif (storm arcs, nature vines, frost spikes, fire flames, earth rubble, shadow wisps) in one of three shapes (`orb`, `path`, `ring`) on whatever carries it, in one infusion pass drawn last within a per-frame budget (`INFUSION_BUDGET`: `ManaFx`'s transient carriers first, then `drawInfusions`); the engine's `beam`, `slash`, `explode` and `dash` events carry `infusion`, basic attacks draw `HeroWeapon.infusion` (null until elemental affinity; the Training Grounds' Basic infusion previews it), and infused paths and blasts mark the pixel floor (nature grows vines: `growth` in `pixel/world.ts`). Cosmetic, so it may use `Math.random` (the motifs don't: they hash `seed` and `time`, so they never shimmer).
```

In the spec, `**Status:** Approved in conversation.` becomes `**Status:** Built in v0.42.0.`

In `packages/client/package.json`: `"version": "0.41.1"` becomes `"version": "0.42.0"`.

- [ ] **Step 3: Full verification**

Run, and check each is green before claiming anything:
- `cd packages/engine && npx vitest run && npx tsc --noEmit -p .` (the pacing guard rails included)
- `pnpm -F @alloy/engine build`
- `cd packages/client && npx tsc --noEmit -p . && npx vitest run`

Expected: all green. Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 4: Commit and push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md packages/client/package.json
git commit -m "docs: infusion motifs in the Delve notes

chore(client): bump version to 0.42.0"
git push -q origin claude/alloy-loot-gear-system-6upsy5
```

`git status` must show nothing but the three untracked 2026-05-01 plan docs.
