# Delve Training Grounds Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Training Grounds sandbox behind the Anvil where any weapon, legendary power, attunement and ability build can be tried mid-fight on training dummies or real monsters, with a damage meter and rule toggles, without ever touching the save.

**Architecture:** Every sandbox rule lives in the engine: a new `src/arpg/sandbox.ts` builds an empty arena (`createFloorWorld` with `empty: true`), places dummies, spawns monsters and flips toggles stored on `ArpgWorld.sandbox`, which `step.ts`, `combat.ts` and `cast.ts` check where each rule lives; `computeHeroStats` takes an `extra` of legendaries and attunement, and `refreshWorldHero` now handles mid-fight build swaps. On the client, `useArena` splits into `useArenaCore` (Pixi, input, ticker, HUD) plus a dive mode (today's behaviour, unchanged) and a sandbox mode (`useTrainingArena`), driven by a separate Zustand store and shown on a new `/delve/training` page with a docked or sheet panel.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), React 19, Zustand 5, Zod 3, PixiJS 8, Playwright, `@alloy/pixel-forge` (code-drawn sprite).

**Spec:** `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md`. Read it first; it is the requirements.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available. Run any Python helper script from a file (not a heredoc) with `PYTHONIOENCODING=utf-8`.
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (the `git commit` blocks below show only the subject and body; add the trailer).
- Stage files by path. Never `git add -A` or `git add .` at the repo root: unrelated untracked plan docs exist and must stay out.
- Push only at the very end, with `git push -q origin claude/alloy-loot-gear-system-6upsy5`. Never open a PR.
- After any engine `src` edit, rebuild with `pnpm -F @alloy/engine build` before any client check or dev server: the client consumes the built engine. Restart the dev server after an engine build (Vite can serve a stale bundle).
- `tests/delve-pacing.test.ts` must still pass unchanged: nothing here may change a dive.
- Format only the `.ts`/`.tsx` files you touched: `npx prettier --write <files>` (never a folder); the commit steps show it. Never run Prettier on the hand-formatted JSON (`balance.json`, `manifest.json`): edit it with the Edit tool, keeping its one-line-per-group layout. Two touched files aren't Prettier-clean today (`packages/engine/src/delve/profile-schema.ts`, `packages/client/src/App.tsx`): leave them out, so their diffs stay one line.
- Client store tests live in `src/stores/` (not `__tests__`).
- Naming in engine tests: `tests/fixtures/arena.ts` already has `dummy()`, meaning "a sturdy normal foe that doesn't fight back". The Training Grounds' dummies are made with `spawnDummies`; `tests/delve-training.test.ts` never imports the fixture `dummy`, and its world helper is called `sandbox()`.

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `cd packages/engine && npx vitest run tests/<file>.test.ts` |
| All engine tests | `cd packages/engine && npx vitest run` |
| Engine typecheck | `cd packages/engine && npx tsc --noEmit -p .` |
| Engine build | `pnpm -F @alloy/engine build` |
| Client typecheck + tests | `cd packages/client && npx tsc --noEmit -p . && npx vitest run` |
| One client test file | `cd packages/client && npx vitest run <path>` |
| Dev server for E2E | `cd packages/client && npx vite --port 5288 --strictPort --force --host` (run in the background) |
| E2E | `cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>` |
| Sprite atlas | `pnpm -F @alloy/pixel-forge forge build` |

**E2E scratch config** (used in Tasks 9, 21 and 22; create it when needed and delete it after): `packages/client/playwright.scratch.config.ts`

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

A timeout under load that passes on a rerun (`-g <test> --repeat-each 2`) is flakiness. A consistent failure is a regression: debug it with logging, not guesses.

## File map

**Engine (`packages/engine/`)**

| File | Change |
|---|---|
| `src/types/delve.ts` | `SandboxBalance`; `DelveBalance.sandbox` |
| `src/types/arpg.ts` | `SandboxToggles`, `DummyLayout`, `HitSource` (moved here from `combat.ts`); `MonsterEntity.dummy`; `ArpgWorld.sandbox`; `hit` event `source` + `slot`; `heroHit` event `blocked` |
| `src/data/schemas.ts` | `DelveBalanceSchema.sandbox` |
| `src/data/balance.json` | `delve.sandbox` |
| `src/arpg/sandbox.ts` (new) | `createSandboxWorld`, `setSandboxToggles`, `spawnDummies`, `resetDummies`, `spawnMonsters`, `clearMonsters`, `fillCharge`, `respawnHero`, `sandboxWeapon` |
| `src/arpg/world.ts` | `FloorOptions.empty`; world `sandbox: null`; monster `dummy: null`; mid-fight build swaps in `refreshWorldHero` |
| `src/arpg/step.ts` | a sandbox never clears; infinite mana; dummies skip their AI; dummies don't budge for the hero |
| `src/arpg/combat.ts` | dummy resist, reset and execute exemption in `hitMonster`; `hit` source + slot; `killMonster` drops nothing in a sandbox (`dropLoot`) and moves `bossId` on (`livingBossId`); Invulnerable in `hurtHero` |
| `src/arpg/abilities/cast.ts` | No cooldowns in `pay`; charge refill in `fire` |
| `src/arpg/action.ts` | `cancelWindup` (shared by the dodge and build swaps) |
| `src/arpg/dodge.ts` | uses `cancelWindup` |
| `src/delve/hero-stats.ts` | `HeroStatsExtra`; `computeHeroStats` / `computeAttunement` take `extra` |
| `src/delve/profile-schema.ts` | export `AbilityBuildSchema` |
| `src/index.ts` | export the sandbox API, `HeroStatsExtra`, `GearItemSchema`, `AbilityBuildSchema` |
| `tests/delve-training.test.ts` (new) | every engine test for this feature |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `package.json` | `zod` dependency (the same `^3.24.0` as the engine, so one copy); version `0.41.0` |
| `src/features/delve/arena/useArenaCore.ts` (new) | the shared arena core: Pixi, renderer, ticker, input, hit-stop, HUD snapshot, actions, host resize; `ArenaMode` |
| `src/features/delve/arena/useArena.ts` | the dive mode on the core (same API and behaviour) |
| `src/features/delve/arena/ArenaRenderer.ts` | `pruneViews` (views of monsters that are gone); dummies hide their life bar; blocked hero hits in grey |
| `src/features/delve/arena/input.ts` | ignore list: text fields, selects, sliders; the menu key works from sliders and selects |
| `src/features/delve/arena/arena-sounds.ts` (new) | `playArenaEvents`, `noManaToaster`: the arena's sounds, haptics and no-mana toast, moved out of `DelveRun.tsx` |
| `src/pages/DelveRun.tsx` | `onUi` uses `arena-sounds.ts` (behaviour identical) |
| `src/features/gamepad/use-gamepad-nav.ts` | left/right step a focused `<select>` |
| `src/features/delve/AbilitiesPanel.tsx` | prop-driven `AbilityEditor`; `AttunementBars({ stats })`; `Chip` exported; `AbilitiesPanel` is the Anvil wrapper |
| `src/features/delve/training/meter.ts` (new) | `DamageMeter` (pure) |
| `src/features/delve/training/useTrainingArena.ts` (new) | the sandbox mode + panel actions |
| `src/features/delve/training/MeterView.tsx` (new) | `MeterChip`, `MeterTab` |
| `src/features/delve/training/TrainingPanel.tsx` (new) | panel shell (memoised), tabs, Loadout / Abilities / Targets / Toggles tabs, pointer blur, Back to the Anvil |
| `src/stores/sandboxStore.ts` (new) | the sandbox loadout store, Zod parse, `sandboxEquipped`, `sandboxStats`, `useSandboxStats` |
| `src/pages/DelveTraining.tsx` (new) | `/delve/training` |
| `src/pages/DelveCamp.tsx` | Training Grounds button |
| `src/components/AppShell.tsx` | TabBar hidden on `/delve/training` |
| `src/App.tsx` | route |
| `src/features/delve/__tests__/floor-engine.test.ts`, `src/features/delve/arena/fx/__tests__/hitstop.test.ts` | `hit` fixtures get `source` |
| `src/stores/sandboxStore.test.ts`, `src/features/delve/__tests__/training-meter.test.ts`, `src/features/delve/__tests__/arena-renderer.test.ts`, `src/features/delve/__tests__/arena-sounds.test.ts`, `src/features/delve/__tests__/TrainingPanel.test.tsx`, `src/features/gamepad/__tests__/use-gamepad-nav.test.ts`, `src/pages/__tests__/DelveCamp.test.tsx` (new) | tests |
| `src/features/delve/__tests__/AbilitiesPanel.test.tsx`, `src/features/delve/__tests__/arena-input.test.ts`, `src/features/delve/__tests__/sprite-atlas.test.ts` | new cases |
| `e2e/delve.spec.ts` | D07 (Dive again at the same depth starts a fresh floor) and a fresh-floor check in D03: guards for the core split |
| `e2e/delve-training.spec.ts` (new) | the Training Grounds E2E |

**Art (`packages/pixel-forge/`)**

| File | Change |
|---|---|
| `art/alloy/sprites/dummy.ts` (new) | the training dummy, 16 × 16, 2 frames |
| `art/alloy/manifest.json` | `dummy` entry |
| `art/alloy/review.png`, `../client/public/sprites/delve/atlas.{png,json}` | rebuilt by `forge build` |

**Docs:** `CLAUDE.md` (Delve section: a Training Grounds bullet), the spec's status line.

---

## Chunk 1: Engine sandbox world and training dummies

Chunks 1–3 are engine work. The geometry every test relies on: the arena is 26 × 40, a sandbox hero stands at `heroStart` (13, 26) facing up (−y), the fixed step is 1/30 s, and depth 5 is the Cinder Mines (element `fire`; a boss floor in a dive). So a `single` dummy stands at (13, 22), a `row` at y = 22, 20, 18, 16, 14 and a `clump` centred on (13, 21).

### Task 1: The sandbox world (balance, types, empty floor, no clear, no drops)

**Files:**
- Modify: `packages/engine/src/types/delve.ts` (new `SandboxBalance`; `DelveBalance.sandbox`)
- Modify: `packages/engine/src/types/arpg.ts` (new `SandboxToggles`; `ArpgWorld.sandbox`)
- Modify: `packages/engine/src/data/schemas.ts` (`DelveBalanceSchema`), `packages/engine/src/data/balance.json`
- Modify: `packages/engine/src/arpg/world.ts` (`FloorOptions`, `createFloorWorld`)
- Modify: `packages/engine/src/arpg/step.ts` (`tick`)
- Modify: `packages/engine/src/arpg/combat.ts` (`killMonster`; new `dropLoot`)
- Create: `packages/engine/src/arpg/sandbox.ts` (`createSandboxWorld`)
- Test: `packages/engine/tests/delve-training.test.ts` (new)

- [ ] **Step 0: Commit the reviewed spec and plan**

If `git status` shows the spec or this plan modified (the review revisions), commit them first, so every later commit stays about code:

```bash
git add docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md docs/superpowers/plans/2026-09-26-delve-training-grounds.md
git commit -m "docs: Training Grounds review revisions"
```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/delve-training.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSandboxWorld } from '../src/arpg/sandbox.js';
import { createMonsterEntity } from '../src/arpg/world.js';
import { hitMonster, makeCtx } from '../src/arpg/combat.js';
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import type { AbilityBuilds } from '../src/types/ability.js';
import type { ArpgEvent, ArpgWorld, SandboxToggles } from '../src/types/arpg.js';
import { DEFAULT_BUILDS, bal, gear, registry, run } from './fixtures/arena.js';

// A sandbox hero stands at heroStart (13, 26) facing up (-y); depth 5 is the Cinder Mines (fire).
// The fixtures' `dummy()` is a sturdy normal foe: this file's dummies come from `spawnDummies`.
const SB = bal.sandbox;
const ALL_ON: SandboxToggles = { infiniteMana: true, noCooldowns: true, invulnerable: true };
const ALL_OFF: SandboxToggles = { infiniteMana: false, noCooldowns: false, invulnerable: false };

function sandbox(toggles = ALL_OFF, builds: Partial<AbilityBuilds> = {}, depth = 5): ArpgWorld {
  return createSandboxWorld(registry, {
    depth,
    stats: computeHeroStats({ weapon: gear('fire'), chest: gear('earth', 'chest') }, registry),
    abilities: { ...DEFAULT_BUILDS, ...builds },
    toggles,
  });
}

function ctxOf(w: ArpgWorld) {
  const events: ArpgEvent[] = [];
  return { ctx: makeCtx(registry, w, events), events };
}

describe('the sandbox world', () => {
  it('is empty at any depth (a boss floor too), never clears, and starts the hero at heroStart', () => {
    for (const depth of [1, 5]) {
      const w = sandbox(ALL_OFF, {}, depth);
      expect(w.monsters).toHaveLength(0);
      expect(w.bossId).toBeNull();
      expect(w.sandbox).toEqual(ALL_OFF);
      expect([w.hero.x, w.hero.y]).toEqual(SB.heroStart);
      expect(w.hero.facing).toEqual({ x: 0, y: -1 });
      expect(run(w, 1).map((e) => e.kind)).not.toContain('cleared');
      expect(w.cleared).toBe(false);
    }
  });

  it('drops nothing when a real monster dies, but heal on kill still works', () => {
    const w = sandbox();
    const rat = createMonsterEntity(
      registry,
      {
        id: 900,
        def: registry.getBiomeForDepth(5).monsters[0],
        kind: 'elite',
        depth: 5,
        door: null,
        element: 'fire',
        x: 13,
        y: 20,
        packId: 1,
      },
      new SeededRNG(1),
    );
    w.monsters.push(rat);
    w.hero.stats = { ...w.hero.stats, healOnKill: 0.1 };
    w.hero.hp = w.hero.stats.maxHp / 2;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, rat, 1e9, null, { source: 'skill' });
    expect(rat.dead).toBe(true);
    expect(w.drops).toHaveLength(0);
    expect(events.filter((e) => e.kind === 'drop')).toHaveLength(0);
    expect(events.find((e) => e.kind === 'death')).toMatchObject({ scrap: 0 });
    expect(w.pending.scrap).toBe(0);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'heal', source: 'kill' }));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts`
Expected: FAIL (`../src/arpg/sandbox.js` does not exist; `bal.sandbox` is undefined).

- [ ] **Step 3: Types, balance and schema**

In `src/types/delve.ts`, above `export interface DelveBalance {`:

```ts
/** The Training Grounds (`delve.sandbox`): where the hero stands, and where dummies and spawns go. */
export interface SandboxBalance {
  /** A dummy's life is the reference monster's life at the depth times this. */
  dummyLifeMult: number;
  /** Where the hero stands (the arena is 26 × 40). */
  heroStart: [number, number];
  /** How far above the hero the first dummy stands. */
  dummyDistance: number;
  /** Gap between dummies in a row (under `abilities.chainRange`, so chains can jump). */
  rowSpacing: number;
  /** How far a clump's dummies sit from its centre. */
  clumpRadius: number;
  /** How far from the hero spawned monsters appear. */
  spawnRing: number;
  /** Dummies and spawns are kept this far inside the walls. */
  edgeMargin: number;
}
```

and in `DelveBalance`, after `feel: FeelBalance;`:

```ts
  sandbox: SandboxBalance;
```

In `src/types/arpg.ts`, above `export interface ArpgWorld {`:

```ts
/** Training Grounds rules (see `arpg/sandbox.ts`); each is checked where its rule lives. */
export interface SandboxToggles {
  /** Mana is topped up every tick. */
  infiniteMana: boolean;
  /** Abilities set no cooldown (nor charge lockout), and charge refills as a charge-paid one lands. */
  noCooldowns: boolean;
  /** Hits take no life (their `heroHit` says `blocked`), so the hero never dies. */
  invulnerable: boolean;
}
```

and in `ArpgWorld`, after `heroDead: boolean;`:

```ts
  /** The Training Grounds' toggles, or null in a dive. Change them with `setSandboxToggles`. */
  sandbox: SandboxToggles | null;
```

In `src/data/schemas.ts`, in `DelveBalanceSchema`, after the `feel: z.object({ … }),` block (just before `arena: z.object({`):

```ts
  sandbox: z.object({
    dummyLifeMult: z.number().positive(),
    heroStart: z.tuple([z.number().min(0), z.number().min(0)]),
    dummyDistance: z.number().positive(),
    rowSpacing: z.number().positive(),
    clumpRadius: z.number().positive(),
    spawnRing: z.number().positive(),
    edgeMargin: z.number().min(0),
  }),
```

In `src/data/balance.json`, replace

```json
      "lobBase": 0.12
    },
    "arena":
```

with

```json
      "lobBase": 0.12
    },
    "sandbox": { "dummyLifeMult": 50, "heroStart": [13, 26], "dummyDistance": 4, "rowSpacing": 2, "clumpRadius": 1.2, "spawnRing": 6, "edgeMargin": 1.5 },
    "arena":
```

- [ ] **Step 4: The empty floor, the clear check and the loot**

In `src/arpg/world.ts`:
- `FloorOptions`, after `loot: LootContext;`:
  ```ts
    /** No packs and no boss (the Training Grounds' open arena). */
    empty?: boolean;
  ```
- In `createFloorWorld`'s world literal, after `heroDead: false,` add `sandbox: null,`.
- `if (boss) {` (the boss spawn) becomes `if (boss && !opts.empty) {`.
- `const packs = Math.max(1, Math.round(basePacks * (mods.packs ?? 1)));` becomes
  ```ts
  const packs = opts.empty ? 0 : Math.max(1, Math.round(basePacks * (mods.packs ?? 1)));
  ```

In `src/arpg/step.ts`, `tick`: `if (!world.cleared && world.monsters.length === 0) {` becomes

```ts
  // A Training Grounds world never clears (so it never ends).
  if (!world.sandbox && !world.cleared && world.monsters.length === 0) {
```

In `src/arpg/combat.ts`, `killMonster`:
- Replace the scrap computation
  ```ts
  const scrap = Math.round(
    bal.loot.scrapPerKill *
      scrapLevelFactor(registry, world.depth) *
      KILL_SCRAP_MULT[m.kind] *
      (1 + h.stats.scrapFind / 100),
  );
  ```
  with
  ```ts
  // The Training Grounds drop nothing: no scrap, items, motes or orbs.
  const scrap = world.sandbox
    ? 0
    : Math.round(
        bal.loot.scrapPerKill *
          scrapLevelFactor(registry, world.depth) *
          KILL_SCRAP_MULT[m.kind] *
          (1 + h.stats.scrapFind / 100),
      );
  ```
- Cut the whole `// Loot` block (from `// Loot` through the health-orb `for` loop, just above `// Hellfire Brand`) and put `if (!world.sandbox) dropLoot(ctx, m);` in its place. Heal on kill, the Shadow-mastery heal, Nightstalker, the Fire-mastery spread and Hellfire Brand stay where they are, so they still happen in a sandbox.
- Below `killMonster`, add the cut block as its own function, unchanged inside:
  ```ts
  /** Items, a mana mote and health orbs burst from a dying foe. */
  function dropLoot(ctx: SimCtx, m: MonsterEntity): void {
    const { world, bal, registry } = ctx;
    // Loot
    const lootRng = world.lootRng;
    // … the rest of the cut block, verbatim (rollEncounterDrops, items, the mote, the orbs) …
  }
  ```
  The block uses only `world`, `bal`, `registry` and `m`, and draws from `lootRng` in the same order, so dives are unchanged.

- [ ] **Step 5: `createSandboxWorld`**

Create `src/arpg/sandbox.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import type { AbilityBuilds } from '../types/ability.js';
import type { ArpgWorld, SandboxToggles } from '../types/arpg.js';
import type { HeroStats } from '../types/delve.js';
import { createFloorWorld } from './world.js';

/**
 * The Training Grounds: an open arena at any depth for trying builds. Its
 * world never clears and drops nothing, training dummies soak hits without
 * acting or dying, any monster can be spawned, and toggles bend the rules
 * (`ArpgWorld.sandbox`, checked where each rule lives). The client only asks
 * for things through these functions. See the Training Grounds spec.
 * Kills and reactions still accrue in `pending`, harmlessly: a sandbox world is never banked.
 */

export interface SandboxWorldOptions {
  depth: number;
  stats: HeroStats;
  abilities: AbilityBuilds;
  toggles: SandboxToggles;
}

/** An empty arena at `depth` (its biome and monster scaling), the hero at `heroStart` facing up. */
export function createSandboxWorld(registry: DataRegistry, o: SandboxWorldOptions): ArpgWorld {
  const bal = registry.getDelveBalance();
  const world = createFloorWorld(registry, {
    depth: o.depth,
    door: null,
    stats: o.stats,
    abilities: o.abilities,
    heroHpFrac: 1,
    potions: bal.dive.potions,
    phoenixAvailable: true,
    seed: 1,
    loot: {
      pity: 0,
      nextUid: 1,
      magicFind: 0,
      legendaryBoost: 1,
      dropMult: 1,
      forceLegendary: false,
    },
    empty: true,
  });
  [world.hero.x, world.hero.y] = bal.sandbox.heroStart;
  world.hero.facing = { x: 0, y: -1 };
  world.sandbox = { ...o.toggles };
  return world;
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/types/arpg.ts packages/engine/src/data/schemas.ts packages/engine/src/data/balance.json packages/engine/src/arpg/world.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): an empty sandbox world that never clears and drops nothing"
```

---

### Task 2: Training dummies

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (new `DummyLayout`; `MonsterEntity.dummy`)
- Modify: `packages/engine/src/arpg/world.ts` (`createMonsterEntity`)
- Modify: `packages/engine/src/arpg/combat.ts` (`hitMonster`)
- Modify: `packages/engine/src/arpg/step.ts` (`monstersTick`, `separate`)
- Modify: `packages/engine/src/arpg/sandbox.ts` (`spawnDummies`, `resetDummies`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-training.test.ts`, extend the imports (each line replaces the file's import from the same module; later tasks extend them the same way):
- `import { createSandboxWorld, resetDummies, spawnDummies } from '../src/arpg/sandbox.js';`
- `import { createMonsterEntity, emptyStatus } from '../src/arpg/world.js';`
- `import { computeHeroStats, referenceMonster } from '../src/delve/hero-stats.js';`
- `import type { ArpgEvent, ArpgWorld, MonsterEntity, SandboxToggles } from '../src/types/arpg.js';`
- `import { DEFAULT_BUILDS, STEP, bal, damaged, gear, press, registry, run } from './fixtures/arena.js';`

Add below the helpers:

```ts
const at = (ms: MonsterEntity[]) => ms.map((m) => [m.x, m.y]);
```

and append:

```ts
describe('training dummies', () => {
  it('stand above the hero in each layout: a normal size-1 foe that never fights, with a lot of life', () => {
    const w = sandbox();
    const [one] = spawnDummies(registry, w, { layout: 'single', element: null });
    expect(at([one])).toEqual([[13, 22]]);
    expect(one).toMatchObject({
      defId: 'dummy',
      kind: 'normal',
      traits: [],
      speed: 0,
      damage: 0,
      radius: bal.monster.radius,
      element: w.element,
      dummy: { homeX: 13, homeY: 22, element: null },
    });
    expect(one.maxHp).toBe(Math.round(referenceMonster(registry, 5).hp * SB.dummyLifeMult));
    expect(at(spawnDummies(registry, w, { layout: 'row', element: null }))).toEqual([
      [13, 22],
      [13, 20],
      [13, 18],
      [13, 16],
      [13, 14],
    ]);
    const clump = at(spawnDummies(registry, w, { layout: 'clump', element: null }));
    expect(clump).toHaveLength(5);
    expect(clump[0]).toEqual([13, 21]);
    for (const [x, y] of clump.slice(1)) expect(Math.hypot(x - 13, y - 21)).toBeCloseTo(SB.clumpRadius);
    expect(w.monsters).toHaveLength(11);
  });

  it('stay inside the walls wherever the hero stands', () => {
    for (const [x, y] of [
      [0.5, 0.5],
      [25.5, 39.5],
      [0.5, 39.5],
    ]) {
      const w = sandbox();
      w.hero.x = x;
      w.hero.y = y;
      for (const layout of ['single', 'row', 'clump'] as const) {
        for (const m of spawnDummies(registry, w, { layout, element: null })) {
          expect(m.x).toBeGreaterThanOrEqual(SB.edgeMargin);
          expect(m.x).toBeLessThanOrEqual(w.width - SB.edgeMargin);
          expect(m.y).toBeGreaterThanOrEqual(SB.edgeMargin);
          expect(m.y).toBeLessThanOrEqual(w.height - SB.edgeMargin);
        }
      }
    }
  });

  it('reset to full on lethal damage, and the same hit still applies its status', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    d.hp = 1;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, d, 1000, 'fire', { source: 'skill', applies: ['burn'] });
    expect(d.dead).toBe(false);
    expect(d.hp).toBe(d.maxHp);
    expect(d.status.burnUntil).toBeGreaterThan(w.t);
    expect(events.map((e) => e.kind)).not.toContain('death');
    expect(w.kills).toBe(0);
    run(w, STEP);
    expect(w.monsters).toContain(d);
  });

  it('are exempt from execute', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    d.hp = d.maxHp * 0.1;
    d.status.freezeUntil = w.t + 5;
    const { ctx, events } = ctxOf(w);
    hitMonster(ctx, d, 1, null, { source: 'skill', execute: 0.5 });
    expect(events.filter((e) => e.kind === 'hit')).toHaveLength(1);
    expect(d.hp).toBeCloseTo(d.maxHp * 0.1 - 1);
  });

  it('resist as set: a Neutral dummy takes no resist or weakness, a fire dummy resists fire', () => {
    const w = sandbox();
    expect(w.element).toBe('fire');
    const [neutral] = spawnDummies(registry, w, { layout: 'single', element: null });
    const [fire] = spawnDummies(registry, w, { layout: 'single', element: 'fire' });
    expect(neutral.element).toBe('fire'); // the look stays the world's
    const { ctx } = ctxOf(w);
    const dot = (m: MonsterEntity, el: 'fire' | 'frost') =>
      hitMonster(ctx, m, 100, el, { source: 'dot', noReact: true });
    expect(dot(neutral, 'fire')).toBeCloseTo(100);
    expect(dot(neutral, 'frost')).toBeCloseTo(100);
    expect(dot(fire, 'fire')).toBeCloseTo(100 * (1 - bal.monster.resist));
    expect(dot(fire, 'frost')).toBeCloseTo(100 * (1 + bal.monster.weakness));
  });

  it('never move or attack, and the hero walking into one does not push it', () => {
    const w = sandbox();
    w.hero.nextAttackAt = 1e9;
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.y = 23.2; // in a real monster's melee reach
    const hp = w.hero.hp;
    run(w, 3);
    expect(at([d])).toEqual([[13, 22]]);
    expect(w.hero.hp).toBe(hp);
    expect(d.windupUntil).toBe(0);
    expect(d.aggro).toBe(false); // its AI never ran: it never noticed the hero
    run(w, 1, { x: 0, y: -1 });
    expect(at([d])).toEqual([[13, 22]]);
    expect(w.hero.y).toBeCloseTo(22 + d.radius + w.hero.radius, 5);
  });

  it('are moved by knockback and pull', () => {
    const w = sandbox();
    w.hero.nextAttackAt = 1e9;
    const [d] = spawnDummies(registry, w, { layout: 'single', element: null });
    hitMonster(ctxOf(w).ctx, d, 1, null, { source: 'skill', knockback: 1, kbFrom: { x: 13, y: 26 } });
    run(w, 0.3);
    expect(d.y).toBeLessThan(22 - 0.3);
    expect(d.x).toBeCloseTo(13, 5);

    // Magnetism (storm + earth) pulls: 75% of the way to a Nova at the hero, 4 units away.
    const p = sandbox(ALL_ON, {
      ultimate: { form: 'nova', elements: ['storm', 'earth'], weight: 0, payment: 'mana' },
    });
    p.hero.nextAttackAt = 1e9;
    const [q] = spawnDummies(registry, p, { layout: 'single', element: null });
    press(p, 2);
    expect(q.y).toBeGreaterThan(23);
  });

  it("a row's spacing lets a chain jump", () => {
    const w = sandbox(ALL_ON, { primary: { form: 'bolt', elements: ['storm'], weight: 0, payment: 'mana' } });
    w.hero.nextAttackAt = 1e9;
    const row = spawnDummies(registry, w, { layout: 'row', element: null });
    const events = [...press(w, 0), ...run(w, 1)];
    expect(events.some((e) => e.kind === 'chain')).toBe(true);
    expect(damaged(row[1])).toBe(true);
  });

  it('resetDummies puts them home with full life, no statuses and no knockback', () => {
    const w = sandbox();
    const [d] = spawnDummies(registry, w, { layout: 'single', element: 'frost' });
    Object.assign(d, { x: 16, y: 30, hp: 5, kbx: 3, kby: -2, lastHitAt: w.t });
    d.status.burnUntil = w.t + 3;
    d.status.chillStacks = 1;
    resetDummies(w);
    expect(d).toMatchObject({ x: 13, y: 22, hp: d.maxHp, kbx: 0, kby: 0, lastHitAt: -1 });
    expect(d.status).toEqual(emptyStatus());
    expect(d.dummy?.element).toBe('frost');
  });
});
```

(The knockback number: a shove of 1 gives `kby = −6`, decaying by `e^(−1/3)` a tick, so 0.3 s moves the dummy about 0.67 up. The pull: the Nova drags it from y = 22 to 25, its Earth knockback then pushes it 0.2 back in the same tick, 24.8.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts`
Expected: FAIL (`spawnDummies` is not exported).

- [ ] **Step 3: Types and the entity field**

In `src/types/arpg.ts`, above `export interface SandboxToggles`:

```ts
/** How `spawnDummies` places a group: one; five in a line going up (lances, chains); or five in a clump (areas). */
export type DummyLayout = 'single' | 'row' | 'clump';
```

In `MonsterEntity`, after `dead: boolean;`:

```ts
  /** A training dummy: where it stands, and the element it resists (null = Neutral). Null for real monsters. */
  dummy: { homeX: number; homeY: number; element: ManaType | null } | null;
```

In `src/arpg/world.ts`, `createMonsterEntity`'s returned object: after `dead: false,` add `dummy: null,`.

- [ ] **Step 4: Dummies in the combat and the tick**

In `src/arpg/combat.ts`, `hitMonster`:
- Replace
  ```ts
  if (element) {
    if (opts.source !== 'dot') amount *= 1 + stats.elementPower[element];
    if (element === m.element) amount *= 1 - bal.monster.resist;
    if (element === ctx.data.weakness[m.element]) amount *= 1 + bal.monster.weakness;
  }
  ```
  with
  ```ts
  // A dummy resists as its own setting says (Neutral: nothing); its `element` is only its look.
  const resists = m.dummy ? m.dummy.element : m.element;
  if (element) {
    if (opts.source !== 'dot') amount *= 1 + stats.elementPower[element];
    if (resists && element === resists) amount *= 1 - bal.monster.resist;
    if (resists && element === ctx.data.weakness[resists]) amount *= 1 + bal.monster.weakness;
  }
  ```
- In the execute check (`if (m.hp > 0 && opts.execute && m.kind !== 'boss' && isFrozen(ctx, m) && …)`), add `!m.dummy &&` right after `m.kind !== 'boss' &&`: dummies are exempt, as bosses are.
- Just above `if (m.hp <= 0) {` (the kill check) add:
  ```ts
  // A training dummy never dies: lethal damage puts it back to full, and the hit carries on.
  if (m.dummy && m.hp <= 0) m.hp = m.maxHp;
  ```

In `src/arpg/step.ts`, `monstersTick`: right after the knockback block (the `if (m.kbx !== 0 || m.kby !== 0) { … }` that ends before `if (!m.aggro) {`) add:

```ts
    // A training dummy keeps its statuses and its knockback, but never acts.
    if (m.dummy) continue;
```

In `separate`, `const heroShare = a.kind === 'boss' ? 0.8 : 0.2;` becomes

```ts
      // A dummy doesn't budge for the hero; a boss mostly doesn't.
      const heroShare = a.dummy ? 1 : a.kind === 'boss' ? 0.8 : 0.2;
```

(Monsters still shove dummies: the monster–monster pass is unchanged.)

- [ ] **Step 5: `spawnDummies` and `resetDummies`**

In `src/arpg/sandbox.ts`, extend the imports (these replace its imports from the same modules):

```ts
import type { ArpgWorld, DummyLayout, MonsterEntity, SandboxToggles, Vec } from '../types/arpg.js';
import type { HeroStats, MonsterDef, SandboxBalance } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { clamp } from './geometry.js';
import { createFloorWorld, createMonsterEntity, emptyStatus } from './world.js';
```

and append:

```ts
/** A dummy is a monster of this definition: its `hp` becomes `dummyLifeMult` (see `spawnDummies`). */
const DUMMY: MonsterDef = { id: 'dummy', name: 'Training Dummy', icon: '🎯', hp: 1, dmg: 1, interval: 1 };
/** Dummies share a pack no monster uses, so hitting one never wakes anything else. */
const DUMMY_PACK = -1;

function inside(world: ArpgWorld, margin: number, x: number, y: number): Vec {
  return { x: clamp(x, margin, world.width - margin), y: clamp(y, margin, world.height - margin) };
}

/** Where a layout's dummies stand, relative to the hero (up is −y). */
function layoutOffsets(sb: SandboxBalance, layout: DummyLayout): Vec[] {
  const up = sb.dummyDistance;
  if (layout === 'single') return [{ x: 0, y: -up }];
  if (layout === 'row') return [0, 1, 2, 3, 4].map((k) => ({ x: 0, y: -(up + k * sb.rowSpacing) }));
  const c = -(up + 1);
  const r = sb.clumpRadius;
  return [
    { x: 0, y: c },
    { x: r, y: c },
    { x: -r, y: c },
    { x: 0, y: c - r },
    { x: 0, y: c + r },
  ];
}

/**
 * Stand a group of training dummies above the hero, inside the walls. A dummy
 * is a normal size-1 foe with the reference monster's life × `dummyLifeMult`
 * that never acts or dies; `element` is what it resists (null = Neutral).
 */
export function spawnDummies(
  registry: DataRegistry,
  world: ArpgWorld,
  o: { layout: DummyLayout; element: ManaType | null },
): MonsterEntity[] {
  const sb = registry.getDelveBalance().sandbox;
  const h = world.hero;
  return layoutOffsets(sb, o.layout).map((off) => {
    const p = inside(world, sb.edgeMargin, h.x + off.x, h.y + off.y);
    const m = createMonsterEntity(
      registry,
      {
        id: world.nextId++,
        def: { ...DUMMY, hp: sb.dummyLifeMult },
        kind: 'normal',
        depth: world.depth,
        door: null,
        element: world.element,
        x: p.x,
        y: p.y,
        packId: DUMMY_PACK,
      },
      world.rng,
    );
    m.speed = 0;
    m.damage = 0;
    m.dummy = { homeX: p.x, homeY: p.y, element: o.element };
    world.monsters.push(m);
    return m;
  });
}

/** Every dummy back home, with full life, no statuses, no knockback and no hit flash. */
export function resetDummies(world: ArpgWorld): void {
  for (const m of world.monsters) {
    if (!m.dummy) continue;
    m.x = m.dummy.homeX;
    m.y = m.dummy.homeY;
    m.hp = m.maxHp;
    m.status = emptyStatus();
    m.kbx = 0;
    m.kby = 0;
    m.lastHitAt = -1;
  }
}
```

`createMonsterEntity` gives life = `baseHp × growth^(depth−1) × def.hp × earlyRamp`, which is `referenceMonster(depth).hp × dummyLifeMult`; it draws from the RNG only for elites, so a dummy uses none.

- [ ] **Step 6: Run to verify they pass**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/world.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): training dummies that soak hits without acting or dying"
```

---

## Chunk 2: Engine spawner, toggles and respawn

The same test file and geometry as Chunk 1 (read its intro). `sandbox()`, `ctxOf()`, `at()`, `ALL_ON` / `ALL_OFF` and `SB` are the helpers Tasks 1 and 2 put in `tests/delve-training.test.ts`.

### Task 3: The spawner, clearing, and the boss bar following the next boss

**Files:**
- Modify: `packages/engine/src/arpg/combat.ts` (new `livingBossId`; `killMonster`)
- Modify: `packages/engine/src/arpg/sandbox.ts` (`spawnMonsters`, `clearMonsters`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the imports: `clearMonsters, spawnMonsters` from `../src/arpg/sandbox.js`, and `killMonster` from `../src/arpg/combat.js`. Append:

```ts
describe('the spawner', () => {
  it('spawns any monster at the depth scaling, with its home element, aggroed, on a ring round the hero', () => {
    const w = sandbox(); // the Cinder Mines: fire
    const wolves = spawnMonsters(registry, w, { defId: 'frost_wolf', kind: 'normal', count: 3 });
    const home = registry.getDelveData().biomes.find((b) => b.id === 'frostvault')!;
    const def = home.monsters.find((m) => m.id === 'frost_wolf')!;
    const ref = createMonsterEntity(
      registry,
      { id: 0, def, kind: 'normal', depth: 5, door: null, element: home.mana, x: 0, y: 0, packId: 0 },
      new SeededRNG(1),
    );
    expect(wolves).toHaveLength(3);
    for (const m of wolves) {
      expect(m).toMatchObject({
        defId: 'frost_wolf',
        kind: 'normal',
        element: 'frost',
        maxHp: ref.maxHp,
        damage: ref.damage,
        aggro: true,
        aggroAt: w.t,
        nextSpecialAt: w.t + 4,
        dummy: null,
      });
      expect(Math.hypot(m.x - 13, m.y - 26)).toBeCloseTo(SB.spawnRing, 5);
    }
    expect(w.totalMonsters).toBe(3);
    const [elite] = spawnMonsters(registry, w, { defId: 'frost_wolf', kind: 'elite', count: 1 });
    expect(elite.kind).toBe('elite');
    expect(w.totalMonsters).toBe(4);
  });

  it('keeps spawns inside the walls, and the count within 1–8', () => {
    const w = sandbox();
    w.hero.x = 1;
    w.hero.y = 1;
    const rats = spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 20 });
    expect(rats).toHaveLength(8);
    for (const m of rats) {
      expect(m.x).toBeGreaterThanOrEqual(SB.edgeMargin);
      expect(m.x).toBeLessThanOrEqual(w.width - SB.edgeMargin);
      expect(m.y).toBeGreaterThanOrEqual(SB.edgeMargin);
      expect(m.y).toBeLessThanOrEqual(w.height - SB.edgeMargin);
    }
    expect(spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 0 })).toHaveLength(1);
  });

  it('a spawned boss takes the boss bar, which then follows the next living boss', () => {
    const w = sandbox();
    const [maw] = spawnMonsters(registry, w, { defId: 'pale_maw', kind: 'boss', count: 1 });
    const [grask] = spawnMonsters(registry, w, { defId: 'foreman_grask', kind: 'boss', count: 1 });
    expect(w.bossId).toBe(grask.id);
    killMonster(ctxOf(w).ctx, grask);
    expect(w.bossId).toBe(maw.id);
    killMonster(ctxOf(w).ctx, maw);
    expect(w.bossId).toBeNull();
  });

  it('clearMonsters removes the real monsters, the dummies or both', () => {
    const w = sandbox();
    spawnDummies(registry, w, { layout: 'row', element: null });
    const [boss] = spawnMonsters(registry, w, { defId: 'pale_maw', kind: 'boss', count: 1 });
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    expect(w.bossId).toBe(boss.id);
    clearMonsters(w, 'monsters');
    expect(w.monsters).toHaveLength(5);
    expect(w.monsters.every((m) => m.dummy)).toBe(true);
    expect(w.bossId).toBeNull();
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    clearMonsters(w, 'dummies');
    expect(w.monsters.map((m) => m.defId)).toEqual(['mine_rat', 'mine_rat']);
    clearMonsters(w, 'all');
    expect(w.monsters).toHaveLength(0);
  });
});
```

(Spawn geometry: a ring of 6 round (13, 26), the first straight up: 3 wolves at (13, 20), (18.2, 29) and (7.8, 29), all inside the walls.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts`
Expected: FAIL (`spawnMonsters` is not exported).

- [ ] **Step 3: The boss bar follows the next living boss**

In `src/arpg/combat.ts`, add above `killMonster`:

```ts
/** The latest living boss's id, or null: the boss bar follows it. */
export function livingBossId(world: ArpgWorld): number | null {
  for (let i = world.monsters.length - 1; i >= 0; i--) {
    const m = world.monsters[i];
    if (!m.dead && m.kind === 'boss') return m.id;
  }
  return null;
}
```

In `killMonster`, after `if (m.kind === 'boss') world.bossKilled = true;` add:

```ts
  if (m.id === world.bossId) world.bossId = livingBossId(world);
```

(A dive's boss floor has one boss, so its bar now points at null instead of a dead id; the HUD shows no bar either way.)

- [ ] **Step 4: `spawnMonsters` and `clearMonsters`**

In `src/arpg/sandbox.ts`, extend the imports with `MonsterKind` (from `../types/arpg.js`) and `import { livingBossId } from './combat.js';`, then append:

```ts
/** A monster definition from any biome (a monster or a boss), with its home biome's mana. */
function findMonster(registry: DataRegistry, defId: string): { def: MonsterDef; mana: ManaType } {
  for (const b of registry.getDelveData().biomes) {
    const def = b.boss.id === defId ? b.boss : b.monsters.find((m) => m.id === defId);
    if (def) return { def, mana: b.mana };
  }
  throw new Error(`Monster not found: ${defId}`);
}

/**
 * Spawn `count` (1–8) monsters of any biome's definition, as `kind`, scaled to
 * the world's depth and in their home element, evenly round a ring about the
 * hero (inside the walls) and already aggroed. A boss takes the boss bar.
 */
export function spawnMonsters(
  registry: DataRegistry,
  world: ArpgWorld,
  o: { defId: string; kind: MonsterKind; count: number },
): MonsterEntity[] {
  const sb = registry.getDelveBalance().sandbox;
  const { def, mana } = findMonster(registry, o.defId);
  const n = Math.max(1, Math.min(8, Math.round(o.count)));
  const h = world.hero;
  const out: MonsterEntity[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const p = inside(world, sb.edgeMargin, h.x + Math.cos(a) * sb.spawnRing, h.y + Math.sin(a) * sb.spawnRing);
    const m = createMonsterEntity(
      registry,
      { id: world.nextId++, def, kind: o.kind, depth: world.depth, door: null, element: mana, x: p.x, y: p.y, packId: 0 },
      world.rng,
    );
    m.aggro = true;
    m.aggroAt = world.t;
    m.nextSpecialAt = world.t + 4;
    world.monsters.push(m);
    if (o.kind === 'boss') world.bossId = m.id;
    out.push(m);
  }
  world.totalMonsters += n;
  return out;
}

/** Remove the real monsters, the dummies, or all; the boss bar moves to the next living boss. */
export function clearMonsters(world: ArpgWorld, which: 'monsters' | 'dummies' | 'all'): void {
  world.monsters = world.monsters.filter((m) =>
    which === 'all' ? false : which === 'dummies' ? !m.dummy : !!m.dummy,
  );
  if (!world.monsters.some((m) => m.id === world.bossId)) world.bossId = livingBossId(world);
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): spawn and clear sandbox monsters; the boss bar follows the next boss"
```

---

### Task 4: Toggles, Fill charge and respawn

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`heroHit` event `blocked`)
- Modify: `packages/engine/src/arpg/step.ts` (`heroTick`)
- Modify: `packages/engine/src/arpg/abilities/cast.ts` (`pay`, `fire`)
- Modify: `packages/engine/src/arpg/combat.ts` (`hurtHero`)
- Modify: `packages/engine/src/arpg/sandbox.ts` (`setSandboxToggles`, `fillCharge`, `respawnHero`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the imports: `fillCharge, respawnHero, setSandboxToggles` from `../src/arpg/sandbox.js`; `hurtHero` from `../src/arpg/combat.js`; `dodge, pressOnly` from `./fixtures/arena.js`. Append:

```ts
describe('toggles', () => {
  it('infinite mana keeps the pool full', () => {
    const w = sandbox({ ...ALL_OFF, infiniteMana: true });
    w.hero.mana = 0;
    run(w, STEP);
    expect(w.hero.mana).toBe(w.hero.manaMax);
    const off = sandbox();
    off.hero.mana = 0;
    run(off, STEP);
    expect(off.hero.mana).toBeLessThan(1);
  });

  it('no cooldowns: the same ability fires again right after it lands, and charge refills as it lands', () => {
    const on = sandbox({ ...ALL_OFF, noCooldowns: true, infiniteMana: true });
    const off = sandbox({ ...ALL_OFF, infiniteMana: true });
    for (const w of [on, off]) {
      w.hero.nextAttackAt = 1e9;
      spawnDummies(registry, w, { layout: 'single', element: null });
      press(w, 0);
      pressOnly(w, 0);
    }
    expect(on.hero.windup?.slot).toBe(0);
    expect(off.hero.windup).toBeNull(); // 0.45 s cooldown

    const u = sandbox({ ...ALL_OFF, noCooldowns: true }); // the Ultimate is a charge-paid Nova
    fillCharge(u);
    const need = u.hero.abilities[2].chargeNeed;
    press(u, 2);
    expect(u.hero.charge[2]).toBe(need);
    pressOnly(u, 2);
    expect(u.hero.windup?.slot).toBe(2);
  });

  it('switching no cooldowns on frees abilities already cooling down', () => {
    const w = sandbox();
    w.hero.cooldowns = [5, 5, 5];
    setSandboxToggles(w, { ...ALL_OFF, noCooldowns: true });
    expect(w.sandbox).toEqual({ ...ALL_OFF, noCooldowns: true });
    for (const c of w.hero.cooldowns) expect(c).toBeLessThanOrEqual(w.t);
  });

  it('invulnerable: no life lost, the would-be damage reported as blocked, and a perfect dodge still counts', () => {
    const w = sandbox({ ...ALL_OFF, invulnerable: true });
    const hp = w.hero.hp;
    const { ctx, events } = ctxOf(w);
    hurtHero(ctx, 1e6, 'fire', null);
    expect(w.hero.hp).toBe(hp);
    expect(w.heroDead).toBe(false);
    const hit = events.find(
      (e): e is Extract<ArpgEvent, { kind: 'heroHit' }> => e.kind === 'heroHit',
    )!;
    expect(hit).toMatchObject({ dodged: false, blocked: true });
    expect(hit.amount).toBeGreaterThan(0);

    dodge(w);
    const next = ctxOf(w);
    hurtHero(next.ctx, 50, null, null);
    expect(next.events.map((e) => e.kind)).toContain('perfectDodge');
  });

  it('fill charge fills every charge-paid slot', () => {
    const w = sandbox(ALL_OFF, { defensive: { form: 'ward', elements: ['frost'], weight: 0, payment: 'charge' } });
    fillCharge(w);
    const [, guard, ult] = w.hero.abilities;
    expect(w.hero.charge).toEqual([0, guard.chargeNeed, ult.chargeNeed]);
  });

  it('respawn restores the hero where it fell and clears its action state', () => {
    const w = sandbox();
    spawnMonsters(registry, w, { defId: 'mine_rat', kind: 'normal', count: 2 });
    w.hero.potions = 0;
    w.hero.phoenixUsed = true;
    w.hero.phoenixAvailable = false;
    hurtHero(ctxOf(w).ctx, 1e9, null, null, { unavoidable: true });
    expect(w.heroDead).toBe(true);
    const h = w.hero;
    h.windup = { slot: 0, aim: null, at: { x: 13, y: 20 }, start: 0, until: 1, step: 0, conjureUntil: 1, chargePaid: 0 };
    h.swing = { step: 0, dir: { x: 0, y: -1 }, targetId: null, start: 0, strikeAt: 1, cycle: 1, committed: true };
    h.push = { fromX: 13, fromY: 26, dx: 0, dy: -1, start: 0, until: 1, stopId: null };
    h.recoverUntil = w.t + 5;
    h.dodge = { dir: { x: 1, y: 0 }, fromX: 13, fromY: 26, start: 0, until: 1, perfect: false };
    h.defend = { form: 'ward', until: w.t + 5 };
    h.ward = { hp: 10, max: 10 };
    const spot = { x: h.x, y: h.y };
    respawnHero(registry, w);
    expect(w.heroDead).toBe(false);
    expect(h).toMatchObject({
      ...spot,
      hp: h.stats.maxHp,
      potions: bal.dive.potions,
      phoenixAvailable: true,
      phoenixUsed: false,
      windup: null,
      swing: null,
      push: null,
      dodge: null,
      defend: null,
      ward: null,
    });
    expect(h.recoverUntil).toBeLessThanOrEqual(w.t);
    expect(h.invulnUntil).toBeCloseTo(w.t + 1);
    expect(w.monsters).toHaveLength(2);
  });
});
```

(Why the "off" press waits: the bolt is pressed at t = 1/30, lands at t = 0.2, and its 0.45 s cooldown runs from the press; one more step is nowhere near it.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts`
Expected: FAIL (`fillCharge` is not exported; the toggles do nothing yet).

- [ ] **Step 3: The event field**

In `src/types/arpg.ts`, the `heroHit` member of `ArpgEvent` gains, after `element: ManaType | null;`:

```ts
      /** Invulnerable (Training Grounds): `amount` is what it would have taken; no life was lost. */
      blocked?: boolean;
```

- [ ] **Step 4: Each toggle where its rule lives**

In `src/arpg/step.ts`, `heroTick`: replace `h.mana = Math.min(h.manaMax, h.mana + h.manaRegen * dt);` with

```ts
  // Infinite mana (Training Grounds) tops the pool up every tick.
  h.mana = world.sandbox?.infiniteMana
    ? h.manaMax
    : Math.min(h.manaMax, h.mana + h.manaRegen * dt);
```

In `src/arpg/abilities/cast.ts`:
- `pay`: `h.cooldowns[slot] = from + ab.cooldown;` becomes
  ```ts
  // No cooldowns (Training Grounds): no cooldown, and so no charge lockout.
  if (!ctx.world.sandbox?.noCooldowns) h.cooldowns[slot] = from + ab.cooldown;
  ```
- `fire`: after `if (ab.recovery > 0) h.recoverUntil = world.t + ab.recovery;` add
  ```ts
  // No cooldowns also refills a charge-paid ability as it lands.
  if (world.sandbox?.noCooldowns && ab.build.payment === 'charge') h.charge[slot] = ab.chargeNeed;
  ```

In `src/arpg/combat.ts`, `hurtHero`: replace

```ts
  if (dmg <= 0) return;
  h.hp -= dmg;
  h.lastHitAt = world.t;
  ctx.events.push({ kind: 'heroHit', x: h.x, y: h.y, amount: dmg, dodged: false, element });
```

with

```ts
  if (dmg <= 0) return;
  // Invulnerable (Training Grounds): the hit lands and reports its damage, but takes no life.
  const blocked = !!world.sandbox?.invulnerable;
  if (!blocked) h.hp -= dmg;
  h.lastHitAt = world.t;
  ctx.events.push({
    kind: 'heroHit',
    x: h.x,
    y: h.y,
    amount: dmg,
    dodged: false,
    element,
    ...(blocked ? { blocked: true } : {}),
  });
```

Everything around it is untouched: the i-frame and perfect-dodge check before it, the Ward, thorns and vampiric after it. Life never drops, so the death check can't fire.

- [ ] **Step 5: `setSandboxToggles`, `fillCharge`, `respawnHero`**

In `src/arpg/sandbox.ts`, append:

```ts
/** Change the toggles (the client never writes `world.sandbox` itself). */
export function setSandboxToggles(world: ArpgWorld, toggles: SandboxToggles): void {
  world.sandbox = { ...toggles };
  // Switching No cooldowns on frees every ability at once.
  if (toggles.noCooldowns) world.hero.cooldowns = world.hero.cooldowns.map((c) => Math.min(c, world.t));
}

/** Fill every charge-paid slot (for when No cooldowns is off). */
export function fillCharge(world: ArpgWorld): void {
  const h = world.hero;
  h.abilities.forEach((ab, i) => {
    if (ab.build.payment === 'charge') h.charge[i] = ab.chargeNeed;
  });
}

/**
 * The hero fell with Invulnerable off: back at once where it fell, with full
 * life and potions and Phoenix ready, every action and buff cleared, and a
 * second of invulnerability so a crowd can't kill it again at once. Monsters stay.
 */
export function respawnHero(registry: DataRegistry, world: ArpgWorld): void {
  const h = world.hero;
  const t = world.t;
  world.heroDead = false;
  h.hp = h.stats.maxHp;
  h.potions = registry.getDelveBalance().dive.potions;
  h.phoenixAvailable = true;
  h.phoenixUsed = false;
  h.windup = null;
  h.swing = null;
  h.push = null;
  h.recoverUntil = t;
  h.dodge = null;
  h.defend = null;
  h.ward = null;
  h.invulnUntil = t + 1;
}
```

(`respawnHero` takes the registry, as the spec now says: restoring potions needs `dive.potions`.)

- [ ] **Step 6: Run to verify they pass**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 7: The dives are unchanged**

Run: `cd packages/engine && npx vitest run`
Expected: every engine test passes, `tests/delve-pacing.test.ts` included (a dive world has `sandbox: null`, so no toggle applies).

- [ ] **Step 8: Commit**

```bash
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/step.ts packages/engine/src/arpg/abilities/cast.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): sandbox toggles, fill charge and respawn"
```

---

## Chunk 3: Engine hit sources, build swaps, stats overrides and the sandbox weapon

The same test file, helpers and geometry as Chunks 1–2.

### Task 5: Hit events carry their source

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`HitSource` moves here; the `hit` event gains `source`, `slot`)
- Modify: `packages/engine/src/arpg/combat.ts` (`HitSource` import; both `hit` events in `hitMonster`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe('hit events', () => {
  it('carry their source, and the ability slot for skill hits', () => {
    type Hit = Extract<ArpgEvent, { kind: 'hit' }>;
    const hits = (events: ArpgEvent[]) => events.filter((e): e is Hit => e.kind === 'hit');
    const w = sandbox(ALL_ON);
    spawnDummies(registry, w, { layout: 'single', element: null });
    w.hero.y = 23.5; // the sword reaches the dummy at (13, 22)
    const basic = hits(run(w, 1.5)).find((e) => e.source === 'basic');
    expect(basic).toBeDefined();
    expect(basic!.slot).toBeUndefined();

    w.hero.nextAttackAt = 1e9;
    const later = hits([...press(w, 0), ...run(w, 1.5)]); // a Fire Bolt, which burns
    expect(later.find((e) => e.source === 'skill')).toMatchObject({ slot: 0 });
    expect(later.some((e) => e.source === 'dot')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts -t "hit events"`
Expected: FAIL (`basic` is undefined: no `source` on hit events).

- [ ] **Step 3: Implement**

In `src/types/arpg.ts`, above `export type ArpgEvent =`:

```ts
/** Where a hit on a monster came from (display data: the damage meter's buckets). */
export type HitSource = 'basic' | 'skill' | 'dot' | 'reaction' | 'thorns';
```

and in the `hit` member of `ArpgEvent`, after `heft: number;`:

```ts
      /** Where the hit came from; for skill hits, the ability slot too (0 Primary, 1 Defensive, 2 Ultimate). */
      source: HitSource;
      slot?: number;
```

In `src/arpg/combat.ts`, delete `export type HitSource = 'basic' | 'skill' | 'dot' | 'reaction' | 'thorns';` and add `HitSource` to the `import type { … } from '../types/arpg.js';` list (it stays public through the types barrel). In `hitMonster`, both `ctx.events.push({ kind: 'hit', … })` calls (the hit, and the execute's shatter hit) gain, after their `heft` line:

```ts
    source: opts.source,
    slot: opts.slot,
```

`HitOpts` already carries both: `hitOpts()` sets `slot` for every ability hit (chains and zone ticks included), Armor's retaliation passes slot 1, and Hellfire Brand passes none ("Other skill").

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS. (Hand-built `hit` fixtures in the client are updated in Task 8, after the engine build.)

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/arpg/combat.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): hit events carry their source and ability slot"
```

---

### Task 6: Mid-fight build swaps

**Files:**
- Modify: `packages/engine/src/arpg/action.ts` (new `cancelWindup`)
- Modify: `packages/engine/src/arpg/dodge.ts` (`tryDodge` uses it)
- Modify: `packages/engine/src/arpg/world.ts` (`refreshWorldHero`; new `sameBuild`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the imports: `import { createMonsterEntity, emptyStatus, refreshWorldHero } from '../src/arpg/world.js';`. Append:

```ts
describe('mid-fight build swaps', () => {
  const swap = (w: ArpgWorld, builds: Partial<AbilityBuilds>) =>
    refreshWorldHero(registry, w, w.hero.stats, { ...DEFAULT_BUILDS, ...builds });

  it("a new build for the slot winding up cancels the wind-up: cooldown reset, charge back", () => {
    const w = sandbox(); // the Ultimate is a charge-paid Nova (21 charge)
    fillCharge(w);
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
    const w = sandbox(ALL_OFF, { primary: cast });
    w.hero.nextAttackAt = 1e9;
    spawnDummies(registry, w, { layout: 'single', element: null }); // the Bolt needs a target
    const mana = w.hero.mana;
    pressOnly(w, 0);
    expect(w.hero.windup?.slot).toBe(0);
    swap(w, { primary: { ...cast, form: 'lance' } });
    expect(w.hero.windup).toBeNull();
    expect(w.hero.mana).toBeLessThan(mana - 1);
  });

  it('a new Defensive ends the Ward at once, without bursting', () => {
    const w = sandbox();
    press(w, 1);
    expect(w.hero.ward).not.toBeNull();
    swap(w, { defensive: { form: 'armor', elements: ['earth'], weight: 0, payment: 'mana' } });
    expect(w.hero.ward).toBeNull();
    expect(w.hero.defend).toBeNull();
    expect(run(w, 0.5).map((e) => e.kind)).not.toContain('wardBreak');
  });

  it('unchanged slots carry on', () => {
    const w = sandbox();
    press(w, 1); // a Ward up
    fillCharge(w);
    pressOnly(w, 2); // a Nova winding up
    const windup = { ...w.hero.windup! };
    swap(w, { primary: { ...DEFAULT_BUILDS.primary, form: 'lance' } });
    expect(w.hero.windup).toEqual(windup);
    expect(w.hero.ward).not.toBeNull();
    expect(w.hero.abilities[0].form.id).toBe('lance');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts -t "build swaps"`
Expected: FAIL (the wind-up survives the swap; the Ward too).

- [ ] **Step 3: One wind-up cancel for the dodge and the swaps**

In `src/arpg/action.ts`, change the import to `import type { HeroEntity, Vec } from '../types/arpg.js';` and append:

```ts
/** Drop an ability's wind-up: the mana stays spent, the ability is ready again and its charge comes back. */
export function cancelWindup(h: HeroEntity, t: number): void {
  const w = h.windup;
  if (!w) return;
  h.cooldowns[w.slot] = t;
  h.charge[w.slot] = Math.min(h.abilities[w.slot].chargeNeed, h.charge[w.slot] + w.chargePaid);
  h.windup = null;
}
```

In `src/arpg/dodge.ts`, import `{ cancelSwing, cancelWindup }` from `./action.js`, and replace

```ts
  if (h.windup) {
    h.cooldowns[h.windup.slot] = t;
    const s = h.windup.slot;
    h.charge[s] = Math.min(h.abilities[s].chargeNeed, h.charge[s] + h.windup.chargePaid);
    h.windup = null;
  }
```

with `cancelWindup(h, t);` (keep the comment above it).

- [ ] **Step 4: `refreshWorldHero` handles changed builds**

In `src/arpg/world.ts`:
- Imports: `import { ABILITY_SLOTS, type AbilityBuild, type AbilityBuilds, type ResolvedAbility } from '../types/ability.js';` and `import { cancelWindup } from './action.js';`.
- Replace `refreshWorldHero`'s doc comment with:
  ```ts
  /**
   * Swap in new gear stats and builds mid-floor: abilities re-resolve and the
   * pool resizes, keeping the life fraction and current mana (clamped). Charge,
   * combos and cooldowns carry over. A slot whose build changed drops its
   * wind-up (as a dodge does), and a new Defensive ends the old one's buff and
   * Ward at once, without bursting.
   */
  ```
- In its body, right after the weapon block (the `if (stats.weapon.baseId !== h.stats.weapon.baseId) { … }`) and before `h.stats = stats;`, add:
  ```ts
  const changed = ABILITY_SLOTS.map((slot, i) => !sameBuild(h.abilities[i]?.build, builds[slot]));
  if (h.windup && changed[h.windup.slot]) {
    cancelWindup(h, world.t);
    h.push = null; // its step-in goes with it
  }
  if (changed[1]) {
    h.defend = null;
    h.ward = null;
  }
  ```
- Below `refreshWorldHero`:
  ```ts
  function sameBuild(a: AbilityBuild | undefined, b: AbilityBuild): boolean {
    return (
      !!a &&
      a.form === b.form &&
      a.weight === b.weight &&
      a.payment === b.payment &&
      a.elements.join() === b.elements.join()
    );
  }
  ```

A dive calls `refreshWorldHero` only for gear changes (builds can't change mid-dive), so nothing is cancelled there.

- [ ] **Step 5: Run to verify they pass**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts tests/delve-dodge.test.ts && npx tsc --noEmit -p .`
Expected: PASS (the dodge's wind-up cancel is unchanged).

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/engine/src/arpg/action.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/arpg/action.ts packages/engine/src/arpg/dodge.ts packages/engine/src/arpg/world.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): builds swap mid-fight, cancelling a changed slot's wind-up and Ward"
```

---

### Task 7: Hero stats overrides

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts` (new `HeroStatsExtra`; `computeAttunement`, `computeHeroStats`)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend the imports: `import { computeAttunement, computeHeroStats, hasMastery, manaPool, referenceMonster } from '../src/delve/hero-stats.js';`, `import { generateItem } from '../src/loot/item-generator.js';`, and `import type { GearItem } from '../src/types/gear.js';`. Append:

```ts
describe('hero stats overrides', () => {
  const eq = { weapon: gear('fire'), chest: gear('earth', 'chest') };
  /** A bare amulet (no lines) carrying one legendary power at a set value, or none. */
  const amulet = (power: { id: string; value: number } | null): GearItem => {
    const item = generateItem(
      registry,
      { uid: 'amulet', ilvl: 3, rarity: 'legendary', slot: 'amulet', legendaryId: 'prism' },
      new SeededRNG(1),
    );
    const bare: GearItem = { ...item, implicits: [], affixes: [] };
    delete bare.legendary;
    return power ? { ...bare, legendary: { ...power, roll: 1 } } : bare;
  };

  it('extra legendaries apply as gear would, the higher of gear and extra winning', () => {
    const plain = computeHeroStats(eq, registry);
    const glass = computeHeroStats(eq, registry, { legendaries: { glass_cannon: 50 } });
    expect(glass.legendaries.glass_cannon).toBe(50);
    expect(glass.damageMult).toBeCloseTo(plain.damageMult + 0.5);
    expect(glass.maxHp).toBeCloseTo(plain.maxHp * 0.8);
    const worn = { ...eq, amulet: amulet({ id: 'glass_cannon', value: 40 }) };
    const higher = computeHeroStats(worn, registry, { legendaries: { glass_cannon: 50 } });
    const lower = computeHeroStats(worn, registry, { legendaries: { glass_cannon: 30 } });
    expect(higher.legendaries.glass_cannon).toBe(50);
    expect(lower.legendaries.glass_cannon).toBe(40);
  });

  it('extra attunement adds to the gear, before masteries and the mana pool', () => {
    const plain = computeHeroStats(eq, registry);
    expect(hasMastery(registry, plain.attunement, 'earth')).toBe(false);
    const earth = computeHeroStats(eq, registry, { attunement: { earth: 10 } });
    expect(earth.attunement.earth).toBe(plain.attunement.earth + 10);
    expect(hasMastery(registry, earth.attunement, 'earth')).toBe(true);
    expect(earth.maxHp).toBeCloseTo(plain.maxHp * 1.2); // the Earth mastery
    expect(manaPool(earth, registry).max).toBe(manaPool(plain, registry).max + 10 * bal.mana.poolPerAttune);
  });

  it('an extra Prism raises every element without stacking on gear Prism', () => {
    const base = computeAttunement({ ...eq, amulet: amulet(null) }, registry);
    const plus = (n: number) => Object.fromEntries(Object.entries(base).map(([m, v]) => [m, v + n]));
    const gear2 = { ...eq, amulet: amulet({ id: 'prism', value: 2 }) };
    const gear1 = { ...eq, amulet: amulet({ id: 'prism', value: 1 }) };
    expect(computeAttunement({ ...eq, amulet: amulet(null) }, registry, { legendaries: { prism: 2 } })).toEqual(plus(2));
    expect(computeAttunement(gear2, registry, { legendaries: { prism: 1 } })).toEqual(plus(2));
    expect(computeAttunement(gear1, registry, { legendaries: { prism: 2 } })).toEqual(plus(2));
    expect(computeHeroStats(gear1, registry, { legendaries: { prism: 2 } }).attunement).toEqual(plus(2));
  });
});
```

(The starter pair is a common fire sword and a common earth cuirass: 1 fire, 1 earth attunement, no mastery. The bare amulet still attunes its own element by rarity, the same in every case.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts -t "overrides"`
Expected: FAIL (the third argument is ignored).

- [ ] **Step 3: Implement**

In `src/delve/hero-stats.ts`, above `computeAttunement`:

```ts
/** Extra powers and attunement on top of the gear (the Training Grounds' toggles). */
export interface HeroStatsExtra {
  /** Legendary id → value, merged with the gear's (the higher wins). */
  legendaries?: Record<string, number>;
  /** Attunement added per element. */
  attunement?: Partial<ManaMap>;
}
```

`computeAttunement` becomes:

```ts
/** Total attunement per mana type from equipped gear (plus any `extra`). */
export function computeAttunement(
  equipped: EquippedGear,
  registry: DataRegistry,
  extra: HeroStatsExtra = {},
): ManaMap {
  const att = emptyManaMap();
  // Prism: the best of the gear's and the extra's, never both.
  let prism = Math.round(extra.legendaries?.prism ?? 0);
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    att[item.mana] += itemAffinityAttunement(registry, item);
    for (const line of [...item.implicits, ...item.affixes]) {
      const mana = ATTUNE_STATS[line.stat];
      if (mana) att[mana] += Math.round(line.value);
    }
    if (item.legendary?.id === 'prism') prism = Math.max(prism, Math.round(item.legendary.value));
  }
  for (const m of MANA_TYPES) att[m] += (extra.attunement?.[m] ?? 0) + prism;
  return att;
}
```

In `computeHeroStats`:
- Signature: `export function computeHeroStats(equipped: EquippedGear, registry: DataRegistry, extra: HeroStatsExtra = {}): HeroStats {`
- `const legendaries: Record<string, number> = {};` becomes `const legendaries: Record<string, number> = { ...extra.legendaries };` (the gear loop's `Math.max` then keeps the higher).
- `const attunement = computeAttunement(equipped, registry);` becomes `const attunement = computeAttunement(equipped, registry, extra);`

Both land before every derived value (life, armor, element power, masteries, the pool), so a power or mastery from `extra` behaves exactly as from gear. Existing callers pass two arguments and are unchanged.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-training.test.ts
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-training.test.ts
git commit -m "feat(engine): hero stats take extra legendaries and attunement"
```

---

### Task 8: The sandbox weapon, the exports, the build

**Files:**
- Modify: `packages/engine/src/arpg/sandbox.ts` (`sandboxWeapon`)
- Modify: `packages/engine/src/delve/profile-schema.ts` (export `AbilityBuildSchema`)
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/client/src/features/delve/__tests__/floor-engine.test.ts`, `packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts` (`hit` fixtures)
- Test: `packages/engine/tests/delve-training.test.ts`

- [ ] **Step 1: Write the failing test**

Extend the imports: `sandboxWeapon` from `../src/arpg/sandbox.js`. Append:

```ts
describe('the sandbox weapon', () => {
  it('has its base implicits only, scaled by rarity and item level, no legendary, and is deterministic', () => {
    const opts = { baseId: 'staff', mana: 'storm', rarity: 'legendary', ilvl: 5 } as const;
    const a = sandboxWeapon(registry, opts);
    expect(sandboxWeapon(registry, opts)).toEqual(a);
    expect(a).toMatchObject({
      slot: 'weapon',
      baseId: 'staff',
      mana: 'storm',
      rarity: 'legendary',
      ilvl: 5,
      affixes: [],
      upgrade: 0,
    });
    expect(a.legendary).toBeUndefined();
    expect(a.name).toContain('Staff');
    expect(a.implicits.map((s) => s.stat)).toEqual(
      registry.getGearBase('staff').implicits.map((t) => t.stat),
    );
    const plain = sandboxWeapon(registry, { ...opts, rarity: 'common', ilvl: 1 });
    expect(a.implicits[0].value).toBeGreaterThan(plain.implicits[0].value);
    expect(computeAttunement({ weapon: a }, registry).storm).toBe(bal.mana.attuneByRarity.legendary);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts -t "sandbox weapon"`
Expected: FAIL (`sandboxWeapon` is not exported).

- [ ] **Step 3: Implement**

In `src/arpg/sandbox.ts`, add the imports `import { SeededRNG } from '../rng/seeded-rng.js';`, `import type { GearItem, Rarity } from '../types/gear.js';` and `import { baseDisplayName, generateItem } from '../loot/item-generator.js';`, then append:

```ts
/**
 * A clean weapon: the base's implicits only, scaled by rarity and item level,
 * with no random affixes and no legendary power (powers come from the
 * toggles). A fixed seed, so the same choice always gives the same item; it
 * attunes to its element by rarity, as any weapon does.
 */
export function sandboxWeapon(
  registry: DataRegistry,
  o: { baseId: string; mana: ManaType; rarity: Rarity; ilvl: number },
): GearItem {
  const item = generateItem(
    registry,
    {
      uid: `sandbox-${o.baseId}`,
      ilvl: o.ilvl,
      rarity: o.rarity,
      slot: 'weapon',
      baseId: o.baseId,
      mana: o.mana,
    },
    new SeededRNG(1),
  );
  item.affixes = [];
  delete item.legendary;
  item.name = baseDisplayName(registry, item);
  return item;
}
```

(`generateItem` rolls the implicits first, with slot, base and mana forced, so they only depend on the seed, rarity and item level.)

In `src/delve/profile-schema.ts`: `const AbilityBuildSchema = z.object({` becomes `export const AbilityBuildSchema = z.object({`.

In `src/index.ts`:
- The hero-stats type export becomes `export type { ItemComparison, ItemStatLine, CombatEstimate, HeroStatsExtra } from './delve/hero-stats.js';`
- After `export type { ProfileActionResult } from './delve/profile.js';`, add `export { GearItemSchema, AbilityBuildSchema } from './delve/profile-schema.js';`
- After `export { makeCtx } from './arpg/combat.js';`, add:
  ```ts
  export {
    createSandboxWorld,
    setSandboxToggles,
    spawnDummies,
    resetDummies,
    spawnMonsters,
    clearMonsters,
    fillCharge,
    respawnHero,
    sandboxWeapon,
  } from './arpg/sandbox.js';
  export type { SandboxWorldOptions } from './arpg/sandbox.js';
  ```

(`SandboxToggles`, `DummyLayout` and `HitSource` are already public through the types barrel.)

- [ ] **Step 4: Run the whole engine suite, then build**

Run: `cd packages/engine && npx vitest run tests/delve-training.test.ts && npx vitest run && npx tsc --noEmit -p .`
Expected: all pass, `tests/delve-pacing.test.ts` included.

Run: `pnpm -F @alloy/engine build`
Expected: builds.

- [ ] **Step 5: The client's hand-built `hit` events**

Run: `cd packages/client && npx tsc --noEmit -p .`
Expected: an error in `src/features/delve/__tests__/floor-engine.test.ts` (its `hit` event lacks `source`). Fix every fixture `tsc` flags:
- `floor-engine.test.ts`: `{ kind: 'hit', id: 1, x: 2, y: 2, amount: 3, crit: false, element: null, heft: 0 },` becomes `{ kind: 'hit', id: 1, x: 2, y: 2, amount: 3, crit: false, element: null, heft: 0, source: 'basic' },`.
- `src/features/delve/arena/fx/__tests__/hitstop.test.ts` compiles through its `as ArpgEvent` cast, but give its helper the field too so the fixture is honest: `({ kind: 'hit', id: 1, x: 0, y: 0, amount: 1, crit, element: null, heft, source: 'basic' }) as ArpgEvent`.
- (`packages/engine/tests/delve-combat-weight.test.ts` only casts events it got from the engine; engine tests aren't type-checked, and it needs no change.)

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Expected: clean, all pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/engine/src/arpg/sandbox.ts packages/engine/src/index.ts packages/engine/tests/delve-training.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts
git add packages/engine/src/arpg/sandbox.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/index.ts packages/engine/tests/delve-training.test.ts packages/client/src/features/delve/__tests__/floor-engine.test.ts packages/client/src/features/delve/arena/fx/__tests__/hitstop.test.ts
git commit -m "feat(engine): the sandbox weapon, and the Training Grounds API exported"
```

---

## Chunk 4: The shared arena core (client)

`useArena.ts` (561 lines) splits into `useArenaCore.ts` (the core) and a dive mode that keeps `useArena`'s API and behaviour. Nothing in the dive may change: the guard is the client suite plus the dive E2E (`e2e/delve.spec.ts`, `e2e/delve-gamepad.spec.ts`), which must pass unchanged. Line numbers below are `useArena.ts` at the start of this chunk (untouched so far).

**What moves where:**

| From `useArena.ts` | To |
|---|---|
| `AbilityHud`, `ArenaHud` (lines 49–94) | `useArenaCore.ts`, verbatim; re-exported from `useArena.ts` (`ArenaHud.tsx` and two tests import them from there) |
| `ArenaUiEvent` (96–103) | stays in `useArena.ts`, now `CoreUiEvent \| <the dive's own events>`; the core's `CoreUiEvent` is `noMana` and `events` |
| `END_DELAY` (105) | stays (the dive's end beat) |
| `SLOWMO_MS`, `SLOWMO_SCALE` (106–108), `readArenaFlags` (110–125), `snapshot` (127–190) | `useArenaCore.ts`, verbatim; `snapshot` re-exported from `useArena.ts` |
| refs and state (202–223) | the core, except `endAtRef` (the dive) and the profile / phase / depth reads (the dive); the core adds `modeRef` |
| `startFloor` (225–236) | the core's `startWorld`: it calls `modeRef.current.createWorld()`; the dive's `createWorld` resets `endAtRef` and calls `beginFloor` |
| the Pixi lifecycle effect (238–496) | the core; its ticker gains the mode's speed, `onHeroDead` and `frame`, and the HUD clock ignores the mode's speed; a `ResizeObserver` on the host resizes the canvas when the host changes size (the Training panel docking) |
| `toCast`, `padFrame`, `padAimView`, `aimView` (338–418) | the core, verbatim, inside the lifecycle effect |
| `handleEvents` (420–432) | the core, minus the bank line; it ends by calling `mode.onEvents` |
| `bank` (434–458), `checkEnd` (460–485) | the dive (`useArena.ts`): `bank` is called from `onEvents`; `checkEnd` is `frame` and returns true once it has called `failFloor` / `completeFloor` |
| the new-floor effect (498–507) | the core's world-key effect; the dive's key is `fighting:${depth}` while fighting, else null |
| the gear hot-swap effect (509–517) | the core's loadout effect (`mode.loadout`, memoised by the dive on `profile.equipped` and `profile.abilities`) |
| `cast` … `pixelsPerUnit` callbacks (519–546) and the return (548–560) | the core, verbatim |

### Task 9: `useArenaCore` and the dive mode

**Files:**
- Create: `packages/client/src/features/delve/arena/useArenaCore.ts`
- Modify: `packages/client/src/features/delve/arena/useArena.ts` (rewritten as the dive mode)
- Modify: `packages/client/e2e/delve.spec.ts` (new D07; a fresh-floor check in D03): they guard the rewritten world-start logic
- Test (guards): `packages/client/src/features/delve/__tests__/arena-hud-snapshot.test.ts`, the whole client suite, `packages/client/e2e/delve.spec.ts`, `packages/client/e2e/delve-gamepad.spec.ts`

- [ ] **Step 1: Guard the world start, on the baseline**

The core replaces the dive's "new floor" effect with the world-key rule, so first pin down what it must keep doing: a fresh floor after a door, and a fresh floor after "Dive again" at the same depth (the key goes `fighting:1` → null → `fighting:1`). A finished world shows `✓ clear` in `monsters-left`; a fresh one shows its foes.

In `packages/client/e2e/delve.spec.ts`, D03: after `await expect(page.getByTestId('depth-label')).not.toHaveText('DEPTH 1');` add

```ts
    await expect(page.getByTestId('monsters-left')).toContainText('foes');
```

and add, after D03:

```ts
  test('D07: diving again at the same depth starts a fresh floor', async ({ page }) => {
    await seedProfile(page);
    await page.goto('/delve');
    await page.getByTestId('delve-button').click();
    await expect(page.getByTestId('door-choice')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('extract-button').click();
    const summary = page.getByTestId('dive-summary');
    await expect(summary).toContainText('EXTRACTED');
    // No checkpoint yet, so "Dive again" starts at depth 1: the same key as the finished floor.
    await page.getByTestId('dive-again').click();
    await expect(summary).toBeHidden();
    await expect(page.getByTestId('depth-label')).toHaveText('DEPTH 1');
    await expect(page.getByTestId('monsters-left')).toContainText('foes', { timeout: ARENA_READY });
  });
```

The engine was built at the end of Task 8. Restart the dev server on port 5288 (stop it if running, then `cd packages/client && npx vite --port 5288 --strictPort --force --host` in the background) and create the E2E scratch config (see the header). Then run, before touching the arena code:

Run: `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts`
Expected: all green, D07 and the new D03 check included (they describe today's behaviour). Note any flake (rerun it alone) so it isn't blamed on the refactor later. Keep the server and the scratch config for Step 5.

- [ ] **Step 2: Create `useArenaCore.ts`**

Create `packages/client/src/features/delve/arena/useArenaCore.ts`:

```ts
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Application } from 'pixi.js';
import {
  botInput,
  refreshWorldHero,
  stepWorld,
  abilityReady,
  basicStep,
  makeCtx,
  pressStep,
  type AbilityBuilds,
  type AbilityCast,
  type ArpgEvent,
  type ArpgWorld,
  type FormId,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { ArenaRenderer } from './ArenaRenderer';
import { loadDelveSprites } from './sprites';
import {
  attachKeyboard,
  createArenaInput,
  moveVector,
  type ArenaInput,
  type CastPress,
} from './input';
import { TAP_MS, aimMarkerFor } from './aim-gestures';
import { padState, takeArenaPresses } from '@/features/gamepad/gamepad-hub';
import { useControlsStore } from '@/stores/controlsStore';
import { padToArena, stickAimPoint, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { rumble } from '@/features/gamepad/rumble';
import { HitStop } from './fx/hitstop';

/**
 * The arena shared by the dive and the Training Grounds: the Pixi app and
 * renderer, the ticker, keyboard, mouse and controller input, hit-stop, the
 * HUD snapshot, and the cast, dodge and attack actions. A mode (`ArenaMode`)
 * says which world to run and what to do with it. Rules stay in the engine:
 * this only times and routes.
 */

// ← `AbilityHud` and `ArenaHud`: useArena.ts lines 49–94, verbatim.

/** What the core reports to the page, from any fight. */
export type CoreUiEvent =
  | { kind: 'noMana'; slot: number }
  | { kind: 'events'; events: ArpgEvent[] };

/** What runs in the arena. The core reads the latest one on every frame. */
export interface ArenaMode {
  /**
   * A new world is made whenever this changes to a string (from null back to
   * the same string included, so "Dive again" at the same depth starts a
   * fresh floor). While it is null the current world stays on screen.
   */
  worldKey: string | null;
  /** The world for the current (non-null) key. */
  createWorld: () => ArpgWorld;
  /** The hero's stats and builds, hot-swapped whenever this object changes: memoise it. */
  loadout: { stats: HeroStats; abilities: AbilityBuilds };
  /**
   * On every frame the core steps the world (never while paused, never after
   * the world is finished); true once the mode is done with it, and the core
   * stops stepping it until a new world is made.
   */
  frame: (world: ArpgWorld) => boolean;
  /** After each step that had events. */
  onEvents: (world: ArpgWorld, events: ArpgEvent[]) => void;
  /** Once, on the frame the hero dies. */
  onHeroDead: (world: ArpgWorld) => void;
  /** Display speed (1 = normal), times the perfect-dodge slow motion and the timescale hook. */
  speed: number;
}

export interface ArenaOpts {
  paused: boolean;
  insets: { top: number; bottom: number };
  onUi: (e: CoreUiEvent) => void;
  /** Basic attacks on a button (held or tapped) instead of automatic. */
  manualAttack: boolean;
}

// ← `SLOWMO_MS` and `SLOWMO_SCALE` with their comment (lines 106–108), `readArenaFlags` with its
//   doc comment (lines 110–125) and `snapshot` (lines 127–190): verbatim.

export function useArenaCore(
  hostRef: RefObject<HTMLDivElement | null>,
  mode: ArenaMode,
  opts: ArenaOpts,
) {
  const registry = getDelveRegistry();
  const inputRef = useRef<ArenaInput>(createArenaInput());
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const worldRef = useRef<ArpgWorld | null>(null);
  const finishedRef = useRef(false);
  const modeRef = useRef(mode);
  const pausedRef = useRef(opts.paused);
  const onUiRef = useRef(opts.onUi);
  const insetsRef = useRef(opts.insets);
  const slowUntilRef = useRef(0);
  const hitstopRef = useRef(new HitStop());
  const manualRef = useRef(opts.manualAttack);
  modeRef.current = mode;
  manualRef.current = opts.manualAttack;
  const [hud, setHud] = useState<ArenaHud | null>(null);
  const [ready, setReady] = useState(false);
  pausedRef.current = opts.paused;
  onUiRef.current = opts.onUi;
  insetsRef.current = opts.insets;

  const startWorld = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const world = modeRef.current.createWorld();
    worldRef.current = world;
    hitstopRef.current.reset();
    finishedRef.current = false;
    renderer.loadFloor(world, registry.getBiomeForDepth(world.depth));
    setHud(snapshot(world));
  }, [registry]);

  // Pixi application lifecycle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let destroyed = false;
    const app = new Application();
    const detachKeys = attachKeyboard(inputRef.current, () => !pausedRef.current);
    const flags = readArenaFlags();
    let hudClock = 0;
    // `resizeTo` only follows the window; the host can also change size on its own (the
    // Training panel docking beside it), so the canvas follows the host too.
    const hostResize = new ResizeObserver(() => app.queueResize());

    app
      .init({
        resizeTo: host,
        background: 0x050407,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
      })
      .then(() => loadDelveSprites())
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.prepend(app.canvas);
        app.canvas.style.position = 'absolute';
        app.canvas.style.inset = '0';
        const renderer = new ArenaRenderer(app);
        renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
        rendererRef.current = renderer;
        app.renderer.on('resize', () => renderer.resize());
        hostResize.observe(host); // only now: `queueResize` exists once the app is initialised

        app.ticker.add((ticker) => {
          const world = worldRef.current;
          const now = performance.now();
          const mode = modeRef.current;
          // A hit-stop freezes the display (a dt of 0 runs no ticks; presses are still
          // recorded); a perfect dodge and the mode's speed slow it.
          const scale = hitstopRef.current.frozen(now)
            ? 0
            : now < slowUntilRef.current
              ? SLOWMO_SCALE
              : 1;
          const real = Math.min(0.1, ticker.deltaMS / 1000);
          const dt = real * scale * mode.speed;
          if (!world) return;
          const paused = pausedRef.current;
          const pad = padFrame(world, paused);
          if (!paused && !finishedRef.current) {
            const input = inputRef.current;
            const padMove = pad && (pad.move.x !== 0 || pad.move.y !== 0) ? pad.move : null;
            const padAttackAim =
              pad?.attackHeld && pad.aimDir
                ? stickAimPoint(world.hero, pad.aimDir, 1, world.hero.stats.weapon.range, false)
                : null;
            const wasDead = world.heroDead;
            const events = stepWorld(
              registry,
              world,
              flags.autopilot
                ? botInput(registry, world)
                : {
                    move: padMove ?? moveVector(input),
                    cast: toCast(input.cast),
                    potion: input.potion || !!pad?.potion,
                    dodge: input.dodge || !!pad?.dodge,
                    ...(manualRef.current
                      ? {
                          attack: input.attackHeld || input.attackTap || !!pad?.attackHeld,
                          attackTap: input.attackTap || !!pad?.attackTap,
                          attackAim: padAttackAim
                            ? padAttackAim
                            : input.attackAim
                              ? renderer.screenToWorld(input.attackAim.x, input.attackAim.y)
                              : null,
                        }
                      : {}),
                  },
              dt * flags.timescale,
            );
            input.cast = null;
            input.potion = false;
            input.dodge = false;
            input.attackTap = false;
            if (events.length > 0) {
              renderer.handleEvents(events);
              // The bot-driven E2E runs would otherwise spend a large share of wall time frozen.
              if (!flags.autopilot) hitstopRef.current.onEvents(events, performance.now());
              handleEvents(world, events);
            }
            if (!wasDead && world.heroDead) mode.onHeroDead(world);
            if (mode.frame(world)) finishedRef.current = true;
          }
          renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
          renderer.setAim(aimView(world) ?? padAimView(world));
          renderer.update(paused ? 0 : dt);
          // The HUD refresh ignores the mode's speed, so the sandbox's slow motion doesn't slow
          // it (for the dive, speed 1, this is exactly today's `hudClock += dt`).
          hudClock += real * scale;
          if (hudClock > 0.08) {
            hudClock = 0;
            setHud(snapshot(world));
          }
        });
        setReady(true);
      });

    // ← `toCast`, `padFrame`, `padAimView` and `aimView` with their doc comments:
    //   useArena.ts lines 338–418, verbatim.

    function handleEvents(world: ArpgWorld, events: ArpgEvent[]) {
      onUiRef.current({ kind: 'events', events });
      for (const e of events) {
        if (e.kind === 'noMana') onUiRef.current({ kind: 'noMana', slot: e.slot });
        if (e.kind === 'perfectDodge') {
          slowUntilRef.current = performance.now() + SLOWMO_MS;
          rumble('perfect');
        }
        if (e.kind === 'dodge') rumble('dodge');
        if (e.kind === 'heroHit' && e.amount >= world.hero.stats.maxHp * 0.15) rumble('hurt');
      }
      modeRef.current.onEvents(world, events);
    }

    return () => {
      destroyed = true;
      hostResize.disconnect();
      detachKeys();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      worldRef.current = null;
      setReady(false);
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [hostRef, registry]);

  // A new world whenever the mode's key changes to a string; null keeps the current one.
  useEffect(() => {
    if (ready && mode.worldKey !== null) startWorld();
  }, [ready, mode.worldKey, startWorld]);

  // The loadout changed mid-fight → hot-swap the hero (abilities re-resolve, changed builds swap).
  useEffect(() => {
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.abilities);
      setHud(snapshot(world));
    }
  }, [mode.loadout, registry]);

  // ← the `cast`, `aim`, `attack`, `dodge`, `potion`, `heroScreen` and `pixelsPerUnit` callbacks
  //   with their comments (useArena.ts lines 519–546) and the `return { hud, ready, input, … }`
  //   (lines 548–560): verbatim.
}
```

Replace each `// ← …` marker with the named lines of `useArena.ts`, copied verbatim (they keep compiling: every name they use is in scope above).

The host `ResizeObserver` changes nothing in a dive (its host only changes size with the window, which `resizeTo` already follows); its first callback queues one resize to the same size.

- [ ] **Step 3: Rewrite `useArena.ts` as the dive mode**

Replace the whole of `packages/client/src/features/delve/arena/useArena.ts` with:

```ts
import { useMemo, useRef, type RefObject } from 'react';
import {
  bankWorld,
  beginFloor,
  completeFloor,
  computeHeroStats,
  failFloor,
  type ArpgWorld,
  type GearItem,
  type ReactionId,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { useArenaCore, type ArenaMode, type CoreUiEvent } from './useArenaCore';

export { snapshot, type AbilityHud, type ArenaHud } from './useArenaCore';

/**
 * The dive, on the shared arena core: it runs the save's current floor, banks
 * pickups into the save as they happen, and hands floor clears and deaths back
 * to the dive state machine. Rules stay in the engine: this only times and routes.
 */

export type ArenaUiEvent =
  | CoreUiEvent
  | { kind: 'loot'; kept: GearItem[]; salvaged: GearItem[]; bagFull: boolean }
  | { kind: 'legendary'; item: GearItem; firstTime: boolean }
  | { kind: 'reaction'; reaction: ReactionId }
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean }
  | { kind: 'fell' };

const END_DELAY = 1.3;

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: ArenaUiEvent) => void;
    /** Basic attacks on a button (held or tapped) instead of automatic. */
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const phase = profile.dive?.phase ?? null;
  const depth = profile.dive?.depth ?? 0;
  const onUiRef = useRef(opts.onUi);
  onUiRef.current = opts.onUi;
  const endAtRef = useRef<number | null>(null);
  const stats = useMemo(
    () => computeHeroStats(profile.equipped, registry),
    [profile.equipped, registry],
  );
  const loadout = useMemo(() => ({ stats, abilities: profile.abilities }), [stats, profile.abilities]);

  function bank(world: ArpgWorld) {
    // ← the body of `bank` (old useArena.ts lines 435–457), verbatim.
  }

  /** The clear timers and, after a death, the END_DELAY beat; true once the floor has ended. */
  function checkEnd(world: ArpgWorld): boolean {
    const done =
      world.heroDead ||
      (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5));
    if (!done) return false;
    const now = performance.now() / 1000;
    endAtRef.current ??= now;
    if (now - endAtRef.current < (world.heroDead ? END_DELAY : 0.4)) return false;
    const store = useDelveStore.getState();
    if (world.heroDead) {
      const res = failFloor(registry, store.profile, world);
      store.setProfile(res.profile);
      onUiRef.current({ kind: 'fell' });
    } else {
      const res = completeFloor(registry, store.profile, world);
      store.setProfile(res.profile);
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      onUiRef.current({
        kind: 'cleared',
        bountyAdded: res.bountyAdded,
        bossKilled: res.bossKilled,
      });
    }
    return true;
  }

  const mode: ArenaMode = {
    // Only while fighting: the finished floor stays on screen behind the doors or the summary.
    worldKey: phase === 'fighting' ? `fighting:${depth}` : null,
    createWorld: () => {
      endAtRef.current = null;
      return beginFloor(registry, useDelveStore.getState().profile);
    },
    loadout,
    frame: checkEnd,
    onEvents: (world) => {
      if (world.pending.items.length > 0 || world.pending.reactions.length > 0) bank(world);
    },
    onHeroDead: () => {},
    speed: 1,
  };
  return useArenaCore(hostRef, mode, opts);
}
```

(`opts.onUi` takes the wider `ArenaUiEvent`, so it fits the core's `(e: CoreUiEvent) => void`. The old `finishedRef` guard at the top of `checkEnd` is now the core's: it stops calling `frame` once it returned true. `bank` calls `onUiRef.current(...)` as before.)

- [ ] **Step 4: Typecheck and unit tests**

Run: `cd packages/client && npx prettier --write src/features/delve/arena/useArenaCore.ts src/features/delve/arena/useArena.ts && npx tsc --noEmit -p . && npx vitest run`
Expected: clean; all pass (`arena-hud-snapshot.test.ts` imports `snapshot` through the re-export).

- [ ] **Step 5: The dive E2E, unchanged**

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts`
Expected: the same results as the Step 1 baseline, D07 and the D03 fresh-floor check included. A new consistent failure is a regression in the split: debug it (log the world key, `finishedRef` and each `createWorld` call) rather than guess. Keep the dev server running; delete `playwright.scratch.config.ts`.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/client/e2e/delve.spec.ts
git add packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/arena/useArena.ts packages/client/e2e/delve.spec.ts
git commit -m "refactor(client): split the arena into a shared core and the dive mode"
```

---

## Chunk 5: Sandbox store, meter and ability editor (client)

Pieces the Training Grounds panel and page (Chunks 7–8) are built from, each tested on its own. The engine is already built (Task 8).

### Task 10: The sandbox store

**Files:**
- Modify: `packages/client/package.json`, `pnpm-lock.yaml` (the `zod` dependency)
- Create: `packages/client/src/stores/sandboxStore.ts`
- Test: `packages/client/src/stores/sandboxStore.test.ts` (new)

- [ ] **Step 1: Add Zod to the client**

The store validates its save with Zod and reuses the engine's `GearItemSchema`; the client has no Zod of its own yet. Add the engine's range, so pnpm links the one installed copy (3.25.x).

Stop the 5288 dev server first: on Windows a running Vite holds files under `node_modules` (pnpm fails with EPERM) and keeps a stale dependency pre-bundle.

Run: `pnpm -F @alloy/client add zod@^3.24.0`
Expected: `packages/client/package.json` gains `"zod": "^3.24.0"`; `grep -n "zod@" pnpm-lock.yaml` shows only `zod@3.25.76` entries (no second version).

Then restart the dev server with `--force` (the command in the header), so Vite re-bundles its dependencies.

- [ ] **Step 2: Write the failing test**

Create `packages/client/src/stores/sandboxStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDelveProfile, generateItem, SeededRNG } from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import {
  MAX_DUMMY_GROUPS,
  SANDBOX_DEFAULTS,
  SANDBOX_KEY,
  parseSandbox,
  sandboxEquipped,
  sandboxStats,
  useSandboxStore,
} from './sandboxStore';

const registry = getDelveRegistry();
const store = () => useSandboxStore.getState();

describe('sandboxStore', () => {
  beforeEach(() => {
    localStorage.clear();
    store().reset();
  });

  it('starts from the defaults: a rare fire sword, every toggle on, depth 5', () => {
    expect(parseSandbox(undefined)).toEqual(SANDBOX_DEFAULTS);
    expect(store()).toMatchObject({
      weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
      loadedWeapon: null,
      toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
      depth: 5,
      slowmo: 1,
      dummyElement: null,
      dummies: [],
    });
    const stats = sandboxStats(registry, store());
    expect(stats.weapon.baseId).toBe('sword');
    expect(stats.weapon.element).toBe('fire');
  });

  it('saves every change under its own key and reads it back', () => {
    store().setDepth(9);
    store().setLegendary('glass_cannon', true);
    store().setAttunement('storm', 99);
    store().addDummyGroup({ layout: 'row', element: 'frost' });
    const saved = parseSandbox(JSON.parse(localStorage.getItem(SANDBOX_KEY)!));
    expect(saved.depth).toBe(9);
    expect(saved.legendaries).toEqual({ glass_cannon: registry.getLegendary('glass_cannon').max });
    expect(saved.attunement).toEqual({ storm: 15 });
    expect(saved.dummies).toEqual([{ layout: 'row', element: 'frost' }]);
    expect(localStorage.getItem('alloy:delve:v2')).toBeNull(); // never the Delve save
  });

  it('falls back field by field on bad or missing data', () => {
    expect(parseSandbox('not an object')).toEqual(SANDBOX_DEFAULTS);
    const s = parseSandbox({
      depth: 99,
      weapon: { baseId: 'spoon', mana: 'fire', rarity: 'rare' },
      slowmo: 0.5,
      toggles: { infiniteMana: false, noCooldowns: true, invulnerable: true },
      abilities: { primary: { form: 'ward', elements: ['fire'], weight: 0, payment: 'mana' } },
      legendaries: { not_a_power: 5 },
    });
    expect(s.depth).toBe(SANDBOX_DEFAULTS.depth);
    expect(s.weapon).toEqual(SANDBOX_DEFAULTS.weapon);
    expect(s.slowmo).toBe(0.5);
    expect(s.toggles.infiniteMana).toBe(false);
    expect(s.abilities).toEqual(SANDBOX_DEFAULTS.abilities);
    expect(s.legendaries).toEqual({});
    expect(parseSandbox({ weapon: null }).weapon).toBeNull();
    const nine = Array.from({ length: 9 }, () => ({ layout: 'single', element: null }));
    expect(parseSandbox({ dummies: nine }).dummies).toEqual([]);
  });

  it('keeps a saved loaded weapon only while the weapon choice still names it', () => {
    const bow = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    const named = { baseId: 'bow', mana: 'storm', rarity: 'legendary' };
    expect(parseSandbox({ weapon: named, loadedWeapon: bow }).loadedWeapon).toEqual(bow);
    const other = { baseId: 'sword', mana: 'fire', rarity: 'rare' };
    expect(parseSandbox({ weapon: other, loadedWeapon: bow }).loadedWeapon).toBeNull();
    expect(parseSandbox({ weapon: null, loadedWeapon: bow }).loadedWeapon).toBeNull();
  });

  it(`keeps at most ${MAX_DUMMY_GROUPS} dummy groups`, () => {
    for (let i = 0; i < MAX_DUMMY_GROUPS + 1; i++)
      store().addDummyGroup({ layout: 'single', element: null });
    expect(store().dummies).toHaveLength(MAX_DUMMY_GROUPS);
  });

  it('Load my build copies the real weapon, the other gear and the builds, and clears the extras', () => {
    const profile = createDelveProfile(registry, 7);
    const bow = generateItem(
      registry,
      { uid: 'L1', ilvl: 9, rarity: 'legendary', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(3),
    );
    store().setLegendary('glass_cannon', true);
    store().setAttunement('fire', 5);
    store().loadMyBuild({ ...profile, equipped: { ...profile.equipped, weapon: bow } });
    const s = store();
    expect(s.loadedWeapon).toEqual(bow);
    expect(s.weapon).toEqual({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(s.gear).toEqual({ chest: profile.equipped.chest });
    expect(s.abilities).toEqual(profile.abilities);
    expect(s.legendaries).toEqual({});
    expect(s.attunement).toEqual({});
    expect(sandboxEquipped(registry, s).weapon).toEqual(bow);
    expect(sandboxStats(registry, s).legendaries[bow.legendary!.id]).toBe(bow.legendary!.value);

    // Re-picking the same choice (the pressed chip) keeps the real weapon; any change drops it.
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'legendary' });
    expect(store().loadedWeapon).toEqual(bow);
    s.setWeapon({ baseId: 'bow', mana: 'storm', rarity: 'rare' });
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon?.legendary).toBeUndefined();
  });

  it('Load my build without a weapon leaves the hero unarmed', () => {
    const profile = createDelveProfile(registry, 7);
    const { weapon: _weapon, ...rest } = profile.equipped;
    store().loadMyBuild({ ...profile, equipped: rest });
    expect(store().weapon).toBeNull();
    expect(store().loadedWeapon).toBeNull();
    expect(sandboxEquipped(registry, store()).weapon).toBeUndefined();
    expect(sandboxStats(registry, store()).weapon.baseId).toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/stores/sandboxStore.test.ts`
Expected: FAIL (`./sandboxStore` does not exist).

- [ ] **Step 4: Implement**

Create `packages/client/src/stores/sandboxStore.ts`:

```ts
import { useMemo } from 'react';
import { z } from 'zod';
import {
  AbilityBuildSchema,
  GearItemSchema,
  computeHeroStats,
  defaultAbilities,
  sandboxWeapon,
  type AbilityBuild,
  type AbilityBuilds,
  type AbilitySlot,
  type DataRegistry,
  type DelveProfile,
  type DummyLayout,
  type EquippedGear,
  type GearItem,
  type HeroStats,
  type ManaMap,
  type ManaType,
  type Rarity,
  type SandboxToggles,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { createHmrStore } from './hmr-store';

/**
 * The Training Grounds loadout: its own weapon, powers, attunement, builds and
 * arena settings, saved apart from the Delve save, which it never touches.
 * Rules stay in the engine; this only remembers the choices.
 */

export const SANDBOX_KEY = 'alloy:delve:sandbox:v1';
export const SLOWMO_SPEEDS = [0.25, 0.5, 0.75, 1] as const;
export const MAX_EXTRA_ATTUNE = 15;
export const MAX_DEPTH = 30;
/** Dummy groups kept (and replayed) at most. */
export const MAX_DUMMY_GROUPS = 8;

export interface WeaponChoice {
  baseId: string;
  mana: ManaType;
  rarity: Rarity;
}

/** The weapon choice an item stands for. */
function choiceOf(item: GearItem): WeaponChoice {
  return { baseId: item.baseId, mana: item.mana, rarity: item.rarity };
}

/** Same base, element and rarity (two unarmed choices match too). */
function sameChoice(a: WeaponChoice | null, b: WeaponChoice | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.baseId === b.baseId && a.mana === b.mana && a.rarity === b.rarity)
  );
}

/** A group of dummies added so far, replayed whenever the arena is rebuilt. */
export interface DummyGroup {
  layout: DummyLayout;
  element: ManaType | null;
}

export interface SandboxLoadout {
  /** The weapon picked, or null for unarmed. */
  weapon: WeaponChoice | null;
  /** The real weapon copied by Load my build, used as-is until a weapon option changes. */
  loadedWeapon: GearItem | null;
  /** The other equipped slots (only Load my build fills them). */
  gear: Omit<EquippedGear, 'weapon'>;
  /** Legendary powers switched on → value (their max roll). */
  legendaries: Record<string, number>;
  /** Attunement added per element, 0–15. */
  attunement: Partial<ManaMap>;
  abilities: AbilityBuilds;
  depth: number;
  /** What new dummies resist: null = Neutral. */
  dummyElement: ManaType | null;
  dummies: DummyGroup[];
  toggles: SandboxToggles;
  /** Display speed: 0.25, 0.5, 0.75 or 1. */
  slowmo: number;
}

export const SANDBOX_DEFAULTS: SandboxLoadout = {
  weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
  loadedWeapon: null,
  gear: {},
  legendaries: {},
  attunement: {},
  abilities: defaultAbilities('fire'),
  depth: 5,
  dummyElement: null,
  dummies: [],
  toggles: { infiniteMana: true, noCooldowns: true, invulnerable: true },
  slowmo: 1,
};

const ManaSchema = z.enum(['fire', 'frost', 'storm', 'earth', 'shadow', 'nature']);
const RaritySchema = z.enum(['common', 'uncommon', 'magic', 'rare', 'epic', 'legendary']);

/** Each field falls back to its default when it is missing or bad. */
function loadoutSchema(registry: DataRegistry) {
  const D = SANDBOX_DEFAULTS;
  const weaponIds = new Set(registry.getGearBasesForSlot('weapon').map((b) => b.id));
  const powers = new Set(registry.getDelveData().legendaries.map((l) => l.id));
  const forms = registry.getArpgData().forms;
  const build = (slot: AbilitySlot) =>
    AbilityBuildSchema.refine((b) => forms.some((f) => f.id === b.form && f.slot === slot));
  const item = GearItemSchema.optional();
  return z.object({
    weapon: z
      .object({
        baseId: z.string().refine((id) => weaponIds.has(id)),
        mana: ManaSchema,
        rarity: RaritySchema,
      })
      .nullable()
      .catch(D.weapon),
    loadedWeapon: GearItemSchema.refine((i) => i.slot === 'weapon' && weaponIds.has(i.baseId))
      .nullable()
      .catch(null),
    gear: z
      .object({ helm: item, chest: item, gloves: item, boots: item, amulet: item, ring: item })
      .catch({}),
    legendaries: z
      .record(z.string(), z.number())
      .refine((l) => Object.keys(l).every((id) => powers.has(id)))
      .catch({}),
    attunement: z.record(ManaSchema, z.number().int().min(0).max(MAX_EXTRA_ATTUNE)).catch({}),
    abilities: z
      .object({ primary: build('primary'), defensive: build('defensive'), ultimate: build('ultimate') })
      .catch(D.abilities),
    depth: z.number().int().min(1).max(MAX_DEPTH).catch(D.depth),
    dummyElement: ManaSchema.nullable().catch(null),
    dummies: z
      .array(z.object({ layout: z.enum(['single', 'row', 'clump']), element: ManaSchema.nullable() }))
      .max(MAX_DUMMY_GROUPS)
      .catch([]),
    toggles: z
      .object({ infiniteMana: z.boolean(), noCooldowns: z.boolean(), invulnerable: z.boolean() })
      .catch(D.toggles),
    slowmo: z
      .number()
      .refine((v) => (SLOWMO_SPEEDS as readonly number[]).includes(v))
      .catch(D.slowmo),
  });
}

/** A saved loadout; whatever is missing or bad takes its default. */
export function parseSandbox(raw: unknown): SandboxLoadout {
  const parsed = loadoutSchema(getDelveRegistry()).safeParse(raw);
  if (!parsed.success) return SANDBOX_DEFAULTS;
  const s = parsed.data as SandboxLoadout;
  // A loaded weapon only counts while the choice still names it: a bad save can't show one
  // weapon and fight with another.
  return s.loadedWeapon && !sameChoice(s.weapon, choiceOf(s.loadedWeapon))
    ? { ...s, loadedWeapon: null }
    : s;
}

function load(): SandboxLoadout {
  try {
    const raw = localStorage.getItem(SANDBOX_KEY);
    return raw ? parseSandbox(JSON.parse(raw)) : SANDBOX_DEFAULTS;
  } catch {
    return SANDBOX_DEFAULTS;
  }
}

interface SandboxStore extends SandboxLoadout {
  /** Pick a weapon (null = unarmed); a loaded weapon is dropped, unless the choice is unchanged. */
  setWeapon: (weapon: WeaponChoice | null) => void;
  /** Switch a legendary power on (at its max roll) or off. */
  setLegendary: (id: string, on: boolean) => void;
  setAttunement: (mana: ManaType, extra: number) => void;
  setAbility: (slot: AbilitySlot, build: AbilityBuild) => void;
  setDepth: (depth: number) => void;
  setDummyElement: (element: ManaType | null) => void;
  /** Remember a dummy group (ignored once MAX_DUMMY_GROUPS are kept). */
  addDummyGroup: (group: DummyGroup) => void;
  clearDummyGroups: () => void;
  setToggles: (toggles: SandboxToggles) => void;
  setSlowmo: (speed: number) => void;
  /** Copy the save's gear and builds in (its powers and attunement then come from the items). */
  loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'abilities'>) => void;
  reset: () => void;
}

const FIELDS = Object.keys(SANDBOX_DEFAULTS) as (keyof SandboxLoadout)[];

export const useSandboxStore = createHmrStore<SandboxStore>('sandboxStore', (set, get) => {
  const commit = (patch: Partial<SandboxLoadout>) => {
    set(patch);
    const state = get();
    try {
      localStorage.setItem(SANDBOX_KEY, JSON.stringify(Object.fromEntries(FIELDS.map((k) => [k, state[k]]))));
    } catch {
      /* storage unavailable: keep it for this session */
    }
  };
  return {
    ...load(),
    // Re-clicking the pressed chip changes nothing (so a loaded weapon survives it).
    setWeapon: (weapon) => {
      if (!sameChoice(weapon, get().weapon)) commit({ weapon, loadedWeapon: null });
    },
    setLegendary: (id, on) => {
      const legendaries = { ...get().legendaries };
      if (on) legendaries[id] = getDelveRegistry().getLegendary(id).max;
      else delete legendaries[id];
      commit({ legendaries });
    },
    setAttunement: (mana, extra) =>
      commit({
        attunement: {
          ...get().attunement,
          [mana]: Math.max(0, Math.min(MAX_EXTRA_ATTUNE, Math.round(extra))),
        },
      }),
    setAbility: (slot, build) => commit({ abilities: { ...get().abilities, [slot]: build } }),
    setDepth: (depth) => commit({ depth: Math.max(1, Math.min(MAX_DEPTH, Math.round(depth))) }),
    setDummyElement: (dummyElement) => commit({ dummyElement }),
    addDummyGroup: (group) => {
      if (get().dummies.length < MAX_DUMMY_GROUPS) commit({ dummies: [...get().dummies, group] });
    },
    clearDummyGroups: () => commit({ dummies: [] }),
    setToggles: (toggles) => commit({ toggles }),
    setSlowmo: (slowmo) => commit({ slowmo }),
    loadMyBuild: (profile) => {
      const { weapon, ...gear } = profile.equipped;
      commit({
        weapon: weapon ? choiceOf(weapon) : null,
        loadedWeapon: weapon ?? null,
        gear,
        abilities: profile.abilities,
        legendaries: {},
        attunement: {},
      });
    },
    reset: () => commit(SANDBOX_DEFAULTS),
  };
});

type StatsInput = Pick<
  SandboxLoadout,
  'weapon' | 'loadedWeapon' | 'gear' | 'legendaries' | 'attunement' | 'depth'
>;

/** What the sandbox hero wears: the loaded weapon, else a clean one of the picked kind (item level = depth). */
export function sandboxEquipped(registry: DataRegistry, s: StatsInput): EquippedGear {
  const weapon =
    s.loadedWeapon ?? (s.weapon ? sandboxWeapon(registry, { ...s.weapon, ilvl: s.depth }) : null);
  return weapon ? { ...s.gear, weapon } : { ...s.gear };
}

export function sandboxStats(registry: DataRegistry, s: StatsInput): HeroStats {
  return computeHeroStats(sandboxEquipped(registry, s), registry, {
    legendaries: s.legendaries,
    attunement: s.attunement,
  });
}

/** The sandbox hero's stats, recomputed only when the loadout changes (so the arena hot-swaps only then). */
export function useSandboxStats(): HeroStats {
  const weapon = useSandboxStore((s) => s.weapon);
  const loadedWeapon = useSandboxStore((s) => s.loadedWeapon);
  const gear = useSandboxStore((s) => s.gear);
  const legendaries = useSandboxStore((s) => s.legendaries);
  const attunement = useSandboxStore((s) => s.attunement);
  const depth = useSandboxStore((s) => s.depth);
  return useMemo(
    () => sandboxStats(getDelveRegistry(), { weapon, loadedWeapon, gear, legendaries, attunement, depth }),
    [weapon, loadedWeapon, gear, legendaries, attunement, depth],
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/stores/sandboxStore.ts src/stores/sandboxStore.test.ts && npx vitest run src/stores/sandboxStore.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/client/package.json pnpm-lock.yaml packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts
git commit -m "feat(client): the Training Grounds loadout store"
```

---

### Task 11: The damage meter

**Files:**
- Create: `packages/client/src/features/delve/training/meter.ts`
- Test: `packages/client/src/features/delve/__tests__/training-meter.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/__tests__/training-meter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ArpgEvent, HitSource } from '@alloy/engine';
import { DamageMeter } from '../training/meter';

const hit = (amount: number, source: HitSource, slot?: number): ArpgEvent => ({
  kind: 'hit',
  id: 1,
  x: 0,
  y: 0,
  amount,
  crit: false,
  element: null,
  heft: 0,
  source,
  slot,
});
const melt: ArpgEvent = { kind: 'reaction', reaction: 'melt', x: 0, y: 0 };

describe('the damage meter', () => {
  it('buckets hits by source and ability slot, and counts reactions by name', () => {
    const m = new DamageMeter();
    m.record(
      [
        hit(10, 'basic'),
        hit(20, 'skill', 0),
        hit(30, 'skill', 1),
        hit(40, 'skill', 2),
        hit(50, 'skill'),
        hit(60, 'reaction'),
        hit(70, 'dot'),
        hit(80, 'thorns'),
        melt,
        melt,
      ],
      1,
    );
    const s = m.summary(1);
    expect(s.buckets).toEqual({
      basic: { hits: 1, damage: 10 },
      q: { hits: 1, damage: 20 },
      e: { hits: 1, damage: 30 },
      r: { hits: 1, damage: 40 },
      skill: { hits: 1, damage: 50 },
      reaction: { hits: 1, damage: 60 },
      dot: { hits: 1, damage: 70 },
      thorns: { hits: 1, damage: 80 },
    });
    expect(s.total).toBe(360);
    expect(s.biggest).toBe(80);
    expect(s.reactions).toEqual({ melt: 2 });
  });

  it('measures DPS over the last 5 s of sim time', () => {
    const m = new DamageMeter();
    m.record([hit(100, 'basic')], 1);
    m.record([hit(100, 'basic')], 4);
    expect(m.summary(4).dps).toBeCloseTo(200 / 3); // 3 s since the first hit
    expect(m.summary(7).dps).toBeCloseTo(100 / 5); // the t = 1 hit has left the window
    expect(m.summary(10).dps).toBe(0);
    expect(m.summary(10).total).toBe(200);
  });

  it('reset starts over', () => {
    const m = new DamageMeter();
    m.record([hit(100, 'basic'), melt], 1);
    m.reset();
    expect(m.summary(2)).toMatchObject({ dps: 0, total: 0, biggest: 0, reactions: {} });
    expect(m.summary(2).buckets.basic).toEqual({ hits: 0, damage: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/training-meter.test.ts`
Expected: FAIL (`../training/meter` does not exist).

- [ ] **Step 3: Implement**

Create `packages/client/src/features/delve/training/meter.ts`:

```ts
import type { ArpgEvent, ReactionId } from '@alloy/engine';

/** DPS is measured over this many seconds of sim time. */
export const METER_WINDOW = 5;

export const METER_BUCKETS = ['basic', 'q', 'e', 'r', 'skill', 'reaction', 'dot', 'thorns'] as const;
export type MeterBucket = (typeof METER_BUCKETS)[number];

export const BUCKET_LABEL: Record<MeterBucket, string> = {
  basic: 'Basic attack',
  q: 'Q · Primary',
  e: 'E · Defensive',
  r: 'R · Ultimate',
  skill: 'Other skill',
  reaction: 'Reaction splash',
  dot: 'Damage over time',
  thorns: 'Thorns',
};

export interface MeterSummary {
  /** Damage per second over the last METER_WINDOW seconds of sim time. */
  dps: number;
  total: number;
  biggest: number;
  buckets: Record<MeterBucket, { hits: number; damage: number }>;
  /** Reactions set off, by name. */
  reactions: Partial<Record<ReactionId, number>>;
}

type HitEvent = Extract<ArpgEvent, { kind: 'hit' }>;
const SLOT_BUCKET: MeterBucket[] = ['q', 'e', 'r'];

/** Skill hits go to their slot (none, as Hellfire Brand's: Other skill); the rest by source. */
function bucketOf(e: HitEvent): MeterBucket {
  if (e.source !== 'skill') return e.source;
  return e.slot === undefined ? 'skill' : (SLOT_BUCKET[e.slot] ?? 'skill');
}

function emptyBuckets(): MeterSummary['buckets'] {
  return Object.fromEntries(
    METER_BUCKETS.map((b) => [b, { hits: 0, damage: 0 }]),
  ) as MeterSummary['buckets'];
}

/**
 * The Training Grounds damage meter. It only reads the fight's events. Time is
 * the world's sim time (`world.t`), so hit-stop and slow motion don't skew DPS.
 * Melt, Shatter and Soulfire multiply the hit that set them off, so their
 * damage stays in that hit's bucket.
 */
export class DamageMeter {
  private recent: { t: number; amount: number }[] = [];
  private start: number | null = null;
  private total = 0;
  private biggest = 0;
  private buckets = emptyBuckets();
  private reactions: MeterSummary['reactions'] = {};

  record(events: readonly ArpgEvent[], t: number): void {
    for (const e of events) {
      if (e.kind === 'reaction') this.reactions[e.reaction] = (this.reactions[e.reaction] ?? 0) + 1;
      if (e.kind !== 'hit') continue;
      this.start ??= t;
      this.total += e.amount;
      this.biggest = Math.max(this.biggest, e.amount);
      const b = this.buckets[bucketOf(e)];
      b.hits++;
      b.damage += e.amount;
      this.recent.push({ t, amount: e.amount });
    }
    while (this.recent.length > 0 && this.recent[0].t <= t - METER_WINDOW) this.recent.shift();
  }

  summary(t: number): MeterSummary {
    const since = t - METER_WINDOW;
    const recent = this.recent.reduce((sum, h) => (h.t > since ? sum + h.amount : sum), 0);
    // Early on, divide by the time since the first hit (at least a second), not the whole window.
    const span = this.start === null ? 1 : Math.max(1, Math.min(METER_WINDOW, t - this.start));
    return {
      dps: recent / span,
      total: this.total,
      biggest: this.biggest,
      buckets: Object.fromEntries(
        METER_BUCKETS.map((b) => [b, { ...this.buckets[b] }]),
      ) as MeterSummary['buckets'],
      reactions: { ...this.reactions },
    };
  }

  reset(): void {
    this.recent = [];
    this.start = null;
    this.total = 0;
    this.biggest = 0;
    this.buckets = emptyBuckets();
    this.reactions = {};
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/training/meter.ts src/features/delve/__tests__/training-meter.test.ts && npx vitest run src/features/delve/__tests__/training-meter.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/training/meter.ts packages/client/src/features/delve/__tests__/training-meter.test.ts
git commit -m "feat(client): the Training Grounds damage meter"
```

---

### Task 12: The ability editor through props

**Files:**
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx` (`AttunementBars`, `Chip`, new `AbilityEditor`, `AbilitiesPanel`)
- Test: `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `AbilitiesPanel.test.tsx`, change the first imports to:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { computeHeroStats, defaultAbilities } from '@alloy/engine';
import { AbilitiesPanel, AbilityEditor } from '../AbilitiesPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
```

and append:

```ts
describe('AbilityEditor', () => {
  const stats = computeHeroStats({}, getDelveRegistry());
  const builds = defaultAbilities('storm');

  it('edits the builds it is given through onChange, and names the reactions it is told about', () => {
    const onChange = vi.fn();
    render(
      <AbilityEditor
        builds={builds}
        stats={stats}
        reactionsSeen={['melt']}
        locked={false}
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('abilities-summary')).toHaveTextContent('Storm Bolt');
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(onChange).toHaveBeenCalledWith('primary', { ...builds.primary, form: 'lance' });
    expect(screen.getByTestId('reaction-melt')).toBeInTheDocument();
    expect(screen.getAllByTestId('reaction-unknown')).toHaveLength(6);
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(6);
  });

  it('changes nothing while locked', () => {
    const onChange = vi.fn();
    render(
      <AbilityEditor builds={builds} stats={stats} reactionsSeen={[]} locked onChange={onChange} />,
    );
    fireEvent.click(screen.getByTestId('form-lance'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx`
Expected: FAIL (`AbilityEditor` is not exported).

- [ ] **Step 3: Implement**

In `AbilitiesPanel.tsx`:
- Imports from `@alloy/engine`: drop `computeAttunement` and `type ManaMap`; add `type AbilityBuilds` and `type HeroStats`.
- `AttunementBars` takes the stats. Replace its signature and first lines:
  ```tsx
  export function AttunementBars({ attunement }: { attunement: ManaMap }) {
    const registry = getDelveRegistry();
    const bal = registry.getDelveBalance().mana;
    const masteries = registry.getArpgData().masteries;
    const scale = Math.max(bal.masteryThreshold + 2, ...MANA_TYPES.map((m) => attunement[m] + 1));
    const equipped = useDelveStore((s) => s.profile.equipped);
    const pool = useMemo(
      () => manaPool(computeHeroStats(equipped, registry), registry),
      [equipped, registry],
    );
  ```
  with
  ```tsx
  export function AttunementBars({ stats }: { stats: HeroStats }) {
    const registry = getDelveRegistry();
    const bal = registry.getDelveBalance().mana;
    const masteries = registry.getArpgData().masteries;
    const attunement = stats.attunement;
    const scale = Math.max(bal.masteryThreshold + 2, ...MANA_TYPES.map((m) => attunement[m] + 1));
    const pool = manaPool(stats, registry);
  ```
- `function Chip(` becomes `export function Chip(` (the Training panel reuses it).
- Replace from the `/** The Abilities workshop …` doc comment through the end of `const set = …;` with:
  ```tsx
  export interface AbilityEditorProps {
    builds: AbilityBuilds;
    /** The hero the builds resolve against: legendaries, cooldowns, damage, life, attunement, pool. */
    stats: HeroStats;
    /** Reactions shown by name; the rest show as ???. */
    reactionsSeen: readonly string[];
    /** Read-only (a dive is under way). */
    locked: boolean;
    onChange: (slot: AbilitySlot, build: AbilityBuild) => void;
  }

  /**
   * The ability editor: build the Primary, Defensive and Ultimate from a form,
   * one or two elements, a weight and a payment. Every part is open. The Anvil
   * binds it to the save; the Training Grounds to its own loadout.
   */
  export function AbilityEditor({ builds, stats, reactionsSeen, locked, onChange }: AbilityEditorProps) {
    const registry = getDelveRegistry();
    const data = registry.getArpgData();
    const [slot, setSlot] = useState<AbilitySlot>('primary');
    const pool = manaPool(stats, registry).max;
    const build = builds[slot];
    const resolved = ABILITY_SLOTS.map((s) => resolveAbility(registry, s, builds[s], stats));
    const ab = resolved[ABILITY_SLOTS.indexOf(slot)];
    const [main, infusion] = build.elements;

    const set = (next: Partial<AbilityBuild>) => {
      if (locked) return;
      playSound('buttonClick');
      onChange(slot, { ...build, ...next });
    };
  ```
- In the rest of that component's JSX: `<AttunementBars attunement={attunement} />` becomes `<AttunementBars stats={stats} />`; `{profile.reactionsSeen.length}/` becomes `{reactionsSeen.length}/`; `const seen = profile.reactionsSeen.includes(r.id);` becomes `const seen = reactionsSeen.includes(r.id);`. Nothing else in the JSX changes.
- After the component, append the Anvil wrapper:
  ```tsx
  /** The Anvil's workshop: the save's builds, read-only while a dive is under way. */
  export function AbilitiesPanel() {
    const registry = getDelveRegistry();
    const profile = useDelveStore((s) => s.profile);
    const stats = useMemo(
      () => computeHeroStats(profile.equipped, registry),
      [profile.equipped, registry],
    );
    return (
      <AbilityEditor
        builds={profile.abilities}
        stats={stats}
        reactionsSeen={profile.reactionsSeen}
        locked={isDiveActive(profile)}
        onChange={(slot, build) => useDelveStore.getState().setAbility(slot, build)}
      />
    );
  }
  ```

(`computeHeroStats(…).attunement` is exactly what `computeAttunement` gave before, so the Anvil shows the same numbers.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/AbilitiesPanel.tsx src/features/delve/__tests__/AbilitiesPanel.test.tsx && npx vitest run src/features/delve/__tests__/AbilitiesPanel.test.tsx && npx tsc --noEmit -p .`
Expected: PASS: the new cases and every existing `AbilitiesPanel` case, unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx
git commit -m "refactor(client): the ability editor takes its builds and stats as props"
```

---

## Chunk 6: Shared arena pieces and the sandbox mode (client)

Small changes to shared client code the Training Grounds needs (Tasks 13–16), then its arena mode (Task 17). The dive is unaffected: its worlds have no dummies, no blocked hits and no panel, and its sounds only move (Task 16).

### Task 13: Renderer: gone monsters, dummies, blocked hits

**Files:**
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (new `pruneViews`; `syncMonsters`, `syncDrops`, `drawMonster`, `handleEvents`)
- Modify: `packages/client/src/features/delve/arena/useArenaCore.ts` (`handleEvents`: no hurt rumble for a blocked hit)
- Test: `packages/client/src/features/delve/__tests__/arena-renderer.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/__tests__/arena-renderer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pruneViews } from '../arena/ArenaRenderer';

describe('the arena renderer', () => {
  it('forgets and destroys the views of monsters that are gone', () => {
    const views = new Map([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const destroyed: string[] = [];
    pruneViews(views, new Set([2]), (v) => destroyed.push(v));
    expect([...views.keys()]).toEqual([2]);
    expect(destroyed).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-renderer.test.ts`
Expected: FAIL (`pruneViews` is not exported).

- [ ] **Step 3: Implement**

In `ArenaRenderer.ts`, below `function elemColor(…) { … }`:

```ts
/** Destroy and forget every view whose entity id isn't in `alive`. */
export function pruneViews<V>(
  views: Map<number, V>,
  alive: Set<number>,
  destroy: (view: V) => void,
): void {
  for (const [id, view] of views) {
    if (alive.has(id)) continue;
    destroy(view);
    views.delete(id);
  }
}
```

`syncMonsters` gains, after its loop:

```ts
    // A monster removed without dying (the Training Grounds' Clear) leaves no sprite behind.
    pruneViews(
      this.monsters,
      new Set(w.monsters.map((m) => m.id)),
      (v) => v.root.destroy({ children: true }),
    );
```

(A monster that died was already handed to `dying` by its `death` event, which `handleEvents` sees before `update`.)

`syncDrops` uses it too. Replace its trailing loop

```ts
    for (const [id, v] of this.drops) {
      if (alive.has(id)) continue;
      v.root.destroy({ children: true });
      v.label?.destroy();
      this.drops.delete(id);
    }
```

with

```ts
    pruneViews(this.drops, alive, (v) => {
      v.root.destroy({ children: true });
      v.label?.destroy();
    });
```

In `drawMonster`, the life bar condition `if (m.kind !== 'boss' && (m.hp < m.maxHp || m.kind === 'elite')) {` becomes

```ts
    // Dummies show no life bar: the meter shows the damage.
    if (!m.dummy && m.kind !== 'boss' && (m.hp < m.maxHp || m.kind === 'elite')) {
```

(Dummies need no other renderer change: their `defId` is `dummy`, so `makeCreature` draws the `dummy` sprite once the atlas has it (Task 20), and their `icon` 🎯 until then.)

In `handleEvents`, the `heroHit` case becomes:

```ts
        case 'heroHit':
          if (e.dodged) this.floatText(e.x, e.y - 0.5, 'EVADE', 0x67e8f9, 16);
          // Invulnerable (Training Grounds): the would-be damage in grey, and no flash.
          else if (e.blocked)
            this.floatText(e.x, e.y - 0.3, `-${formatShort(e.amount)}`, 0x9ca3af, 20);
          else {
            this.floatText(e.x, e.y - 0.3, `-${formatShort(e.amount)}`, 0xf87171, 20);
            this.heroFlashUntil = this.time + 0.12;
            this.addShake(Math.min(0.35, 0.08 + (e.amount / w.hero.stats.maxHp) * 1.5));
          }
          break;
```

In `useArenaCore.ts`, `handleEvents`: `if (e.kind === 'heroHit' && e.amount >= world.hero.stats.maxHp * 0.15) rumble('hurt');` becomes

```ts
        if (e.kind === 'heroHit' && !e.blocked && e.amount >= world.hero.stats.maxHp * 0.15)
          rumble('hurt');
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/arena/ArenaRenderer.ts src/features/delve/arena/useArenaCore.ts src/features/delve/__tests__/arena-renderer.test.ts && npx vitest run && npx tsc --noEmit -p .`
Expected: all pass. Importing `ArenaRenderer.ts` loads Pixi, which prints a harmless `HTMLCanvasElement's getContext() method: not implemented` message on stderr under jsdom (no canvas there); the test still passes.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/useArenaCore.ts packages/client/src/features/delve/__tests__/arena-renderer.test.ts
git commit -m "feat(client): the renderer drops views of cleared monsters, hides dummy life bars, greys blocked hits"
```

---

### Task 14: Panel keys stay in the panel

**Files:**
- Modify: `packages/client/src/features/delve/arena/input.ts` (`attachKeyboard`)
- Test: `packages/client/src/features/delve/__tests__/arena-input.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `arena-input.test.ts`:

```ts
describe('panel controls keep their keys', () => {
  let detach = () => {};
  afterEach(() => {
    detach();
    document.body.replaceChildren();
  });

  it('a slider or a list never moves, casts or dodges, but the menu key still works from them', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const slider = document.body.appendChild(document.createElement('input'));
    slider.type = 'range';
    const list = document.body.appendChild(document.createElement('select'));
    const menu = document.body.appendChild(document.createElement('button'));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    const press = (el: Element, code: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));

    press(slider, 'ArrowLeft');
    press(list, 'KeyW');
    press(list, 'KeyQ');
    press(slider, 'Space');
    expect(input.keys).toEqual({ x: 0, y: 0 });
    expect(input.aiming).toBeNull();
    expect(input.dodge).toBe(false);

    press(slider, 'Escape');
    press(list, 'Escape');
    expect(opened).toBe(2);

    // Buttons are not ignored: the dive's keyboard play is unchanged.
    press(menu, 'KeyW');
    expect(input.keys).toEqual({ x: 0, y: -1 });
  });

  it('a text field keeps every key, the menu key included', () => {
    const input = createArenaInput();
    detach = attachKeyboard(input, () => true);
    const text = document.body.appendChild(document.createElement('input'));
    const menu = document.body.appendChild(document.createElement('button'));
    menu.setAttribute('data-pad-menu', '');
    let opened = 0;
    menu.addEventListener('click', () => opened++);
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
    text.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    expect(opened).toBe(0);
    expect(input.keys).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-input.test.ts`
Expected: FAIL (a key on the select moves the hero; Escape on the slider doesn't reach the menu).

- [ ] **Step 3: Implement**

In `input.ts`, above `attachKeyboard`:

```ts
/** Text entry keeps every key, the menu key included. */
function isText(t: EventTarget | null): boolean {
  return t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range');
}

/** Sliders and lists keep their keys (arrows, letters, Space) from moving or attacking. */
function isField(t: EventTarget | null): boolean {
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLSelectElement ||
    t instanceof HTMLTextAreaElement
  );
}
```

In `attachKeyboard`'s `down`, replace

```ts
    if (e.target instanceof HTMLInputElement) return;
    // The menu key works while paused too, so it can close the dive menu.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      return;
    }
    if (!isEnabled()) return;
```

with

```ts
    if (isText(e.target)) return;
    // The menu key works while paused too (so it can close the menu), and from a slider or a list.
    if (!e.repeat && keyAction(e.code) === 'menu') {
      (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      return;
    }
    if (isField(e.target) || !isEnabled()) return;
```

(`keyup` still runs everywhere, so a key let go over a field is still released.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/arena/input.ts src/features/delve/__tests__/arena-input.test.ts && npx vitest run src/features/delve/__tests__/arena-input.test.ts && npx tsc --noEmit -p .`
Expected: PASS (the existing ability-key cases too).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/input.ts packages/client/src/features/delve/__tests__/arena-input.test.ts
git commit -m "feat(client): sliders, lists and text fields keep their keys; the menu key works from sliders"
```

---

### Task 15: Lists on a controller

**Files:**
- Modify: `packages/client/src/features/gamepad/use-gamepad-nav.ts` (`moveFocus`; new `stepSelect`)
- Test: `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts` (new)

The Training panel's Targets tab has lists (biome, monster, depth). A controller moves focus onto them but can't change them: left/right should step the choice, as they already nudge a slider.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { moveFocus } from '../use-gamepad-nav';

describe('moveFocus on a list', () => {
  afterEach(() => document.body.replaceChildren());

  it('left and right step a focused select, clamped at its ends, with a change event', () => {
    const list = document.body.appendChild(document.createElement('select'));
    for (const v of ['a', 'b', 'c']) list.appendChild(new Option(v, v));
    let changes = 0;
    list.addEventListener('change', () => changes++);
    list.focus();

    moveFocus('right');
    expect(list.value).toBe('b');
    moveFocus('right');
    moveFocus('right'); // already at the end: no change
    expect(list.value).toBe('c');
    expect(changes).toBe(2);
    moveFocus('left');
    expect(list.value).toBe('b');
    expect(changes).toBe(3);
    expect(document.activeElement).toBe(list);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/gamepad/__tests__/use-gamepad-nav.test.ts`
Expected: FAIL (focus leaves the list, and its value stays `a`).

- [ ] **Step 3: Implement**

In `use-gamepad-nav.ts`, below `nudgeRange`:

```ts
/** Left/right on a focused list steps its choice, clamped (React hears the change event). */
function stepSelect(el: HTMLSelectElement, dir: NavDir): void {
  const next = Math.min(
    el.options.length - 1,
    Math.max(0, el.selectedIndex + (dir === 'right' ? 1 : -1)),
  );
  if (next === el.selectedIndex) return;
  el.selectedIndex = next;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

and in `moveFocus`, right after the slider branch (`return nudgeRange(active, dir);` and its closing `}`):

```ts
  if (active instanceof HTMLSelectElement && (dir === 'left' || dir === 'right')) {
    return stepSelect(active, dir);
  }
```

In the file's doc comment, after "moves focus to the nearest control in that direction," add "(left/right adjust a focused slider or list)". React's `onChange` on a `<select>` listens to the native `change` event, so the dispatched event reaches it.

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/gamepad/use-gamepad-nav.ts src/features/gamepad/__tests__/use-gamepad-nav.test.ts && npx vitest run src/features/gamepad && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/gamepad/use-gamepad-nav.ts packages/client/src/features/gamepad/__tests__/use-gamepad-nav.test.ts
git commit -m "feat(client): left and right step a focused list on a controller"
```

---

### Task 16: The arena's sounds, shared

**Files:**
- Create: `packages/client/src/features/delve/arena/arena-sounds.ts` (`playArenaEvents`, `noManaToaster`)
- Modify: `packages/client/src/pages/DelveRun.tsx` (`onUi` uses them)
- Test: `packages/client/src/features/delve/__tests__/arena-sounds.test.ts` (new)

The Training Grounds needs the dive's hit, cast, dodge and perfect-dodge sounds (feel testing needs sound) and its "not enough mana" toast. Move them out of `DelveRun.tsx` into a helper both pages use; the dive's behaviour stays identical.

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/features/delve/__tests__/arena-sounds.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/utils/sound-manager', () => ({ playSound: vi.fn() }));
vi.mock('@/shared/utils/haptics', () => ({ vibrate: vi.fn() }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { noManaToaster, playArenaEvents } from '../arena/arena-sounds';

describe('arena sounds', () => {
  beforeEach(() => vi.clearAllMocks());

  it("plays each event's sound and haptic", () => {
    playArenaEvents([
      { kind: 'hit', id: 1, x: 0, y: 0, amount: 5, crit: true, element: null, heft: 0, source: 'basic' },
      { kind: 'perfectDodge', x: 0, y: 0 },
    ]);
    expect(playSound).toHaveBeenCalledWith('crit');
    expect(playSound).toHaveBeenCalledWith('synergyActivate');
    expect(vibrate).toHaveBeenCalledWith('light');
    expect(vibrate).toHaveBeenCalledWith('success');
  });

  it('says "not enough mana" at most every 1.5 s', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const toast = noManaToaster();
    toast('Fire Bolt');
    toast('Fire Bolt');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Not enough mana for Fire Bolt');
    now.mockReturnValue(11_600);
    toast();
    expect(showToast).toHaveBeenLastCalledWith('Not enough mana');
    now.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/arena-sounds.test.ts`
Expected: FAIL (`../arena/arena-sounds` does not exist).

- [ ] **Step 3: Implement**

Create `packages/client/src/features/delve/arena/arena-sounds.ts` (the `switch` is `DelveRun.tsx`'s, moved verbatim):

```ts
import type { ArpgEvent } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';

/** Sounds and haptics for a frame's arena events: the dive and the Training Grounds share them. */
export function playArenaEvents(events: readonly ArpgEvent[]): void {
  for (const ev of events) {
    switch (ev.kind) {
      case 'hit':
        playSound(ev.crit ? 'crit' : 'attack');
        if (ev.crit) vibrate('light');
        break;
      case 'heroHit':
        playSound(ev.dodged ? 'dodge' : 'heroHurt');
        if (!ev.dodged) vibrate('light');
        break;
      case 'reaction':
        playSound('combineMerge');
        break;
      case 'explode':
        if (ev.radius >= 2.4) playSound('forgeSlam');
        break;
      case 'death':
        if (ev.monsterKind !== 'normal') playSound('death');
        break;
      case 'drop':
        if (ev.rarity === 'rare' || ev.rarity === 'epic') playSound('lootRare');
        else if (ev.dropKind === 'item') playSound('lootDrop');
        break;
      case 'pickup':
        if (ev.dropKind === 'item') playSound('dropSuccess');
        else if (ev.dropKind === 'orb') playSound('potion');
        break;
      case 'heal':
        if (ev.source === 'potion') playSound('potion');
        break;
      case 'revive':
        playSound('lootLegendary');
        vibrate('heavy');
        break;
      case 'heroDeath':
        playSound('defeat');
        vibrate('error');
        break;
      case 'cast':
        playSound('orbPlace');
        break;
      case 'dodge':
        vibrate('light');
        break;
      case 'perfectDodge':
        playSound('synergyActivate');
        vibrate('success');
        break;
      default:
        break;
    }
  }
}

/** A "Not enough mana" toast, at most once every 1.5 s. */
export function noManaToaster(): (abilityName?: string) => void {
  let last = 0;
  return (name) => {
    const now = performance.now();
    if (now - last <= 1500) return;
    last = now;
    showToast(name ? `Not enough mana for ${name}` : 'Not enough mana');
  };
}
```

In `packages/client/src/pages/DelveRun.tsx`:
- The React import gains `useMemo`; add `import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';`.
- `const lastNoMana = useRef(0);` becomes `const noManaToast = useMemo(() => noManaToaster(), []);`.
- In `onUi`, the whole `case 'events':` body (the `for (const ev of e.events) { switch (ev.kind) { … } }` loop) becomes `playArenaEvents(e.events);` (keep its `break;`).
- The `case 'noMana': { … }` block becomes:
  ```tsx
        case 'noMana':
          noManaToast(arenaRef.current?.hud?.abilities[e.slot]?.name);
          break;
  ```
- `onUi`'s dependency list becomes `[registry, showBanner, noManaToast]`.

`playSound`, `vibrate` and `showToast` stay imported in `DelveRun.tsx` (banners, fanfares, doors and the bag-full toast still use them).

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/arena/arena-sounds.ts src/features/delve/__tests__/arena-sounds.test.ts src/pages/DelveRun.tsx && npx tsc --noEmit -p . && npx vitest run`
Expected: all pass. (The dive E2E runs again in Task 21.)

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/features/delve/arena/arena-sounds.ts packages/client/src/features/delve/__tests__/arena-sounds.test.ts packages/client/src/pages/DelveRun.tsx
git commit -m "refactor(client): the arena's sounds and no-mana toast as a shared helper"
```

---

### Task 17: `useTrainingArena`, the sandbox mode

**Files:**
- Create: `packages/client/src/features/delve/training/useTrainingArena.ts`

The hook needs Pixi (like `useArena`), so it has no unit test of its own: the E2E (Task 21) drives it, and every piece it is built from is tested (Tasks 1–16).

- [ ] **Step 1: Implement**

Create `packages/client/src/features/delve/training/useTrainingArena.ts`:

```ts
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  clearMonsters,
  createSandboxWorld,
  fillCharge as fillWorldCharge,
  resetDummies as resetWorldDummies,
  respawnHero,
  setSandboxToggles,
  spawnDummies,
  spawnMonsters,
  type DummyLayout,
  type MonsterKind,
} from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStats, useSandboxStore } from '@/stores/sandboxStore';
import { getDelveRegistry } from '../registry';
import { useArenaCore, type ArenaMode, type CoreUiEvent } from '../arena/useArenaCore';
import { DamageMeter, type MeterSummary } from './meter';

/** How often the meter readout refreshes (real time), in ms. */
const METER_EVERY_MS = 250;

/**
 * The Training Grounds on the shared arena core: a sandbox world from the
 * sandbox store (its dummy groups replayed from heroStart on every rebuild),
 * the toggles and loadout hot-swapped mid-fight, a respawn at once on death,
 * and the damage meter fed from the events. Panel actions go through the
 * engine's sandbox functions; nothing here touches the Delve save.
 */
export function useTrainingArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: CoreUiEvent) => void;
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const stats = useSandboxStats();
  const abilities = useSandboxStore((s) => s.abilities);
  const depth = useSandboxStore((s) => s.depth);
  const toggles = useSandboxStore((s) => s.toggles);
  const slowmo = useSandboxStore((s) => s.slowmo);
  const meterRef = useRef(new DamageMeter());
  const [meter, setMeter] = useState<MeterSummary>(() => meterRef.current.summary(0));
  const loadout = useMemo(() => ({ stats, abilities }), [stats, abilities]);

  const mode: ArenaMode = {
    // A new depth rebuilds the arena: dummy groups are replayed, spawned monsters go.
    worldKey: `depth:${depth}`,
    createWorld: () => {
      const s = useSandboxStore.getState();
      const world = createSandboxWorld(registry, {
        depth: s.depth,
        stats,
        abilities: s.abilities,
        toggles: s.toggles,
      });
      for (const group of s.dummies) spawnDummies(registry, world, group);
      meterRef.current.reset();
      return world;
    },
    loadout,
    frame: () => false,
    onEvents: (world, events) => meterRef.current.record(events, world.t),
    onHeroDead: (world) => respawnHero(registry, world),
    speed: slowmo,
  };
  const arena = useArenaCore(hostRef, mode, opts);
  const { worldRef } = arena;

  useEffect(() => {
    if (worldRef.current) setSandboxToggles(worldRef.current, toggles);
  }, [toggles, worldRef]);

  useEffect(() => {
    const id = setInterval(
      () => setMeter(meterRef.current.summary(worldRef.current?.t ?? 0)),
      METER_EVERY_MS,
    );
    return () => clearInterval(id);
  }, [worldRef]);

  // Stable across renders, so the memoised panel doesn't re-render with the HUD.
  const actions = useMemo(
    () => ({
      /** Add a group of dummies (in the store's dummy element) above the hero, up to the cap. */
      addDummies: (layout: DummyLayout) => {
        const s = useSandboxStore.getState();
        if (s.dummies.length >= MAX_DUMMY_GROUPS) return;
        if (worldRef.current)
          spawnDummies(registry, worldRef.current, { layout, element: s.dummyElement });
        s.addDummyGroup({ layout, element: s.dummyElement });
      },
      spawn: (defId: string, kind: MonsterKind, count: number) => {
        if (worldRef.current) spawnMonsters(registry, worldRef.current, { defId, kind, count });
      },
      clear: (which: 'monsters' | 'dummies' | 'all') => {
        if (worldRef.current) clearMonsters(worldRef.current, which);
        if (which !== 'monsters') useSandboxStore.getState().clearDummyGroups();
      },
      resetDummies: () => {
        if (worldRef.current) resetWorldDummies(worldRef.current);
      },
      fillCharge: () => {
        if (worldRef.current) fillWorldCharge(worldRef.current);
      },
      resetMeter: () => {
        meterRef.current.reset();
        setMeter(meterRef.current.summary(worldRef.current?.t ?? 0));
      },
    }),
    [registry, worldRef],
  );

  return { ...arena, meter, actions };
}

export type TrainingArena = ReturnType<typeof useTrainingArena>;
export type TrainingActions = TrainingArena['actions'];
```

How it meets the spec's mode table: the world key is the depth (a rebuild on every depth change); `createWorld` replays the store's `dummies` groups from `heroStart` (the fresh hero stands there) and resets the meter, since the new world's clock starts at 0; `loadout` is memoised on the store's derived stats and builds, so the core hot-swaps only real changes (Task 6's build swaps); `frame` never ends the world; `onEvents` feeds the meter with sim time; `onHeroDead` respawns at once; `speed` is the slow motion. The toggles reach the live world through `setSandboxToggles` whenever they change. `actions` never changes identity (the registry is a singleton, `worldRef` and `setMeter` are stable).

- [ ] **Step 2: Typecheck**

Run: `cd packages/client && npx prettier --write src/features/delve/training/useTrainingArena.ts && npx tsc --noEmit -p . && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/features/delve/training/useTrainingArena.ts
git commit -m "feat(client): the Training Grounds arena mode"
```

---

## Chunk 7: The Training panel (client)

The panel takes plain props (the arena's stable `actions`, the meter summary and callbacks), so it gets a jsdom test of its own.

### Task 18: The meter views and the Training panel

**Files:**
- Create: `packages/client/src/features/delve/training/MeterView.tsx` (`MeterChip`, `MeterTab`)
- Create: `packages/client/src/features/delve/training/TrainingPanel.tsx` (`TrainingPanel` and its tabs; `blurOnPointerUp`)
- Test: `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

The panel takes plain props (`actions` is a bag of functions), so it renders in jsdom without an arena. Create `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MAX_DUMMY_GROUPS, useSandboxStore } from '@/stores/sandboxStore';
import { DamageMeter } from '../training/meter';
import { TrainingPanel, type TrainingTab } from '../training/TrainingPanel';
import type { TrainingActions } from '../training/useTrainingArena';

function renderPanel(tab: TrainingTab) {
  const actions: TrainingActions = {
    addDummies: vi.fn(),
    spawn: vi.fn(),
    clear: vi.fn(),
    resetDummies: vi.fn(),
    fillCharge: vi.fn(),
    resetMeter: vi.fn(),
  };
  const onClose = vi.fn();
  const onExit = vi.fn();
  render(
    <TrainingPanel
      layout="sheet"
      tab={tab}
      onTab={vi.fn()}
      onClose={onClose}
      onExit={onExit}
      actions={actions}
      meter={new DamageMeter().summary(0)}
      onOpenControls={vi.fn()}
    />,
  );
  return { actions, onClose, onExit };
}

describe('TrainingPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useSandboxStore.getState().reset();
  });

  it('a weapon chip sets the sandbox weapon', () => {
    renderPanel('loadout');
    fireEvent.click(screen.getByTestId('weapon-base-staff'));
    expect(useSandboxStore.getState().weapon).toMatchObject({ baseId: 'staff' });
    expect(screen.getByTestId('weapon-name')).toHaveTextContent('Staff');
  });

  it('adds dummies through the arena, and stops at the cap', () => {
    const { actions } = renderPanel('targets');
    fireEvent.click(screen.getByTestId('add-dummy-row'));
    expect(actions.addDummies).toHaveBeenCalledWith('row');
    act(() => {
      for (let i = 0; i < MAX_DUMMY_GROUPS; i++)
        useSandboxStore.getState().addDummyGroup({ layout: 'single', element: null });
    });
    expect(screen.getByTestId('add-dummy-single')).toBeDisabled();
    expect(screen.getByTestId('dummies-full')).toBeInTheDocument();
  });

  it("the sheet's Close answers the controller's B; Back to the Anvil carries no marker", () => {
    const { onClose, onExit } = renderPanel('toggles');
    const close = screen.getByTestId('training-panel-close');
    expect(close).toHaveAttribute('data-pad-back');
    expect(screen.getByRole('tablist')).toHaveAttribute('data-pad-tabs');
    const exit = screen.getByTestId('training-panel-exit');
    expect(exit).not.toHaveAttribute('data-pad-back');
    expect(exit).not.toHaveAttribute('data-pad-menu');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(exit);
    expect(onExit).toHaveBeenCalled();
  });

  it('a control lets go of focus when the pointer does; a list only when the pointer chose it', () => {
    renderPanel('targets');
    const button = screen.getByTestId('reset-dummies');
    button.focus();
    fireEvent.pointerUp(button);
    expect(document.activeElement).not.toBe(button);

    const depth = screen.getByTestId('training-depth') as HTMLSelectElement;
    depth.focus();
    fireEvent.change(depth, { target: { value: '7' } }); // reached with the keyboard: focus stays
    expect(document.activeElement).toBe(depth);
    fireEvent.pointerDown(depth);
    fireEvent.change(depth, { target: { value: '8' } }); // picked with the pointer: let go
    expect(document.activeElement).not.toBe(depth);
    expect(useSandboxStore.getState().depth).toBe(8);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/TrainingPanel.test.tsx`
Expected: FAIL (`../training/TrainingPanel` does not exist).

- [ ] **Step 3: The meter views**

Create `packages/client/src/features/delve/training/MeterView.tsx`:

```tsx
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { BUCKET_LABEL, METER_BUCKETS, METER_WINDOW, type MeterSummary } from './meter';

/** The live readout at the top of the Training Grounds HUD: DPS · total · reset (never wraps). */
export function MeterChip({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  return (
    <div
      className="delve-panel pointer-events-auto flex items-center gap-2 whitespace-nowrap px-2.5 py-1 text-xs"
      data-testid="meter-chip"
    >
      <span className="delve-display font-bold text-amber-300" data-testid="meter-dps">
        {formatNumber(meter.dps)} DPS
      </span>
      <span className="text-stone-500">·</span>
      <span className="text-stone-200" data-testid="meter-total" data-total={Math.round(meter.total)}>
        {formatNumber(meter.total)} total
      </span>
      <button
        type="button"
        className="delve-chip px-2 py-0 text-[11px]"
        onClick={onReset}
        data-testid="meter-reset"
      >
        Reset
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="delve-panel p-2">
      <div className="delve-display text-lg font-bold text-stone-100">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
    </div>
  );
}

/** The full breakdown: damage by source, the biggest hit, and reactions by name. */
export function MeterTab({ meter, onReset }: { meter: MeterSummary; onReset: () => void }) {
  const reactions = getDelveRegistry().getArpgData().reactions;
  return (
    <div className="flex flex-col gap-3" data-testid="meter-tab">
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Stat label={`DPS (last ${METER_WINDOW}s)`} value={formatNumber(meter.dps)} />
        <Stat label="Total" value={formatNumber(meter.total)} />
        <Stat label="Biggest hit" value={formatNumber(meter.biggest)} />
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-stone-500">
            <th className="py-1 text-left font-normal">Source</th>
            <th className="text-right font-normal">Hits</th>
            <th className="text-right font-normal">Damage</th>
            <th className="text-right font-normal">Share</th>
          </tr>
        </thead>
        <tbody>
          {METER_BUCKETS.map((b) => {
            const row = meter.buckets[b];
            return (
              <tr
                key={b}
                className={row.hits > 0 ? 'text-stone-200' : 'text-stone-600'}
                data-testid={`meter-${b}`}
                data-hits={row.hits}
                data-damage={Math.round(row.damage)}
              >
                <td className="py-0.5">{BUCKET_LABEL[b]}</td>
                <td className="text-right">{row.hits}</td>
                <td className="text-right">{formatNumber(row.damage)}</td>
                <td className="text-right">
                  {meter.total > 0 ? Math.round((row.damage / meter.total) * 100) : 0}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-testid="meter-reactions">
        {reactions.map((r) => (
          <span key={r.id} className={meter.reactions[r.id] ? 'text-fuchsia-300' : 'text-stone-600'}>
            {r.icon} {r.name} ×{meter.reactions[r.id] ?? 0}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-stone-500">
        Melt, Shatter and Soulfire multiply the hit that set them off, so their damage stays in that
        hit&apos;s row. Time is the fight&apos;s own, so slow motion doesn&apos;t change the DPS.
      </p>
      <button type="button" className="delve-btn text-sm" onClick={onReset} data-testid="meter-reset-all">
        Reset the meter
      </button>
    </div>
  );
}
```

(`formatNumber` already writes large numbers compactly: 12,345 → "12.3k".)

- [ ] **Step 4: The Training panel**

Create `packages/client/src/features/delve/training/TrainingPanel.tsx`:

```tsx
import {
  memo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  MANA_TYPES,
  RARITY_ORDER,
  itemStatLines,
  type DummyLayout,
  type MonsterKind,
  type SandboxToggles,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import {
  MAX_DEPTH,
  MAX_DUMMY_GROUPS,
  MAX_EXTRA_ATTUNE,
  SLOWMO_SPEEDS,
  sandboxEquipped,
  useSandboxStats,
  useSandboxStore,
  type WeaponChoice,
} from '@/stores/sandboxStore';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR, RARITY_LABEL, formatStat, legendaryText, manaStyle } from '../format';
import { AbilityEditor, AttunementBars, Chip } from '../AbilitiesPanel';
import type { MeterSummary } from './meter';
import { MeterTab } from './MeterView';
import type { TrainingActions } from './useTrainingArena';

export type PanelLayout = 'dock' | 'sheet';
export type TrainingTab = 'loadout' | 'abilities' | 'targets' | 'toggles' | 'meter';

/** The docked panel's width in px (the arena narrows by this). */
export const DOCK_WIDTH = 360;

const TABS: [TrainingTab, string][] = [
  ['loadout', 'Loadout'],
  ['abilities', 'Abilities'],
  ['targets', 'Targets'],
  ['toggles', 'Toggles'],
  ['meter', 'Meter'],
];
const LAYOUTS: [DummyLayout, string][] = [
  ['single', '🎯 One'],
  ['row', '▮ Row of 5'],
  ['clump', '⁂ Clump of 5'],
];
const KINDS: [MonsterKind, string][] = [
  ['normal', 'Normal'],
  ['elite', 'Elite'],
  ['boss', 'Boss'],
];
const SWITCHES: [keyof SandboxToggles, string, string][] = [
  ['infiniteMana', 'Infinite mana', 'The pool refills every moment.'],
  ['noCooldowns', 'No cooldowns', 'An ability can go again as soon as it lands; charge refills as it lands.'],
  ['invulnerable', 'Invulnerable', 'Hits show in grey but take no life. Off: you get up at once when you fall.'],
];

/**
 * A button, switch or slider lets go of focus once the pointer does, so the
 * arena's keys keep working; focus reached with Tab stays. (Lists are handled
 * in the panel: blurring one on pointer-up would close it.)
 */
export function blurOnPointerUp(e: ReactPointerEvent<HTMLElement>): void {
  const el = (e.target as Element).closest('button, input');
  if (el instanceof HTMLElement) el.blur();
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
        {title}
      </div>
      {children}
    </section>
  );
}

const SELECT = 'rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 text-sm text-stone-200';

const LoadoutTab = memo(function LoadoutTab() {
  const registry = getDelveRegistry();
  const s = useSandboxStore();
  const stats = useSandboxStats();
  const weapon = sandboxEquipped(registry, s).weapon;
  const choice = s.weapon;
  const pick = (next: Partial<WeaponChoice>) =>
    s.setWeapon({ baseId: 'sword', mana: 'fire', rarity: 'rare', ...(choice ?? {}), ...next });

  return (
    <div className="flex flex-col gap-4" data-testid="loadout-tab">
      <Section title="Weapon">
        <div className="flex flex-wrap gap-1.5">
          {registry.getGearBasesForSlot('weapon').map((b) => (
            <Chip
              key={b.id}
              pressed={choice?.baseId === b.id}
              onClick={() => pick({ baseId: b.id })}
              testId={`weapon-base-${b.id}`}
            >
              {b.name}
            </Chip>
          ))}
          <Chip pressed={!choice} onClick={() => s.setWeapon(null)} testId="weapon-base-none">
            Unarmed
          </Chip>
        </div>
        <fieldset
          disabled={!choice}
          className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
          style={{ opacity: choice ? 1 : 0.5 }}
        >
          <div className="flex flex-wrap gap-1.5">
            {MANA_TYPES.map((m) => (
              <Chip
                key={m}
                pressed={choice?.mana === m}
                onClick={() => pick({ mana: m })}
                testId={`weapon-mana-${m}`}
              >
                {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RARITY_ORDER.map((r) => (
              <Chip
                key={r}
                pressed={choice?.rarity === r}
                onClick={() => pick({ rarity: r })}
                testId={`weapon-rarity-${r}`}
              >
                <span style={{ color: RARITY_COLOR[r] }}>{RARITY_LABEL[r]}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="delve-panel flex flex-col gap-0.5 p-2.5 text-sm" data-testid="weapon-lines">
          <div
            className="delve-display font-bold"
            style={{ color: weapon ? RARITY_COLOR[weapon.rarity] : '#d6d3d1' }}
            data-testid="weapon-name"
          >
            {weapon ? weapon.name : 'Unarmed'}
          </div>
          {weapon &&
            itemStatLines(weapon, registry).map((l, i) => (
              <div key={i} className="text-stone-300">
                {formatStat(registry, l.stat, l.value)}
              </div>
            ))}
          {weapon?.legendary && (
            <div className="text-orange-300">
              {legendaryText(registry, weapon.legendary.id, weapon.legendary.value)}
            </div>
          )}
          {s.loadedWeapon && (
            <div className="text-[11px] text-stone-500">
              Your own weapon, from Load my build. Change any option for a clean one.
            </div>
          )}
        </div>
      </Section>

      <Section title="Legendary powers">
        <div className="flex flex-col gap-1.5">
          {registry.getDelveData().legendaries.map((l) => {
            const on = l.id in s.legendaries;
            return (
              <button
                key={l.id}
                type="button"
                className="delve-panel flex flex-col items-start gap-0.5 p-2 text-left"
                style={{ borderColor: on ? '#fb923c' : undefined }}
                aria-pressed={on}
                onClick={() => s.setLegendary(l.id, !on)}
                data-testid={`legendary-${l.id}`}
              >
                <span
                  className="delve-display text-sm font-bold"
                  style={{ color: on ? '#fb923c' : '#d6d3d1' }}
                >
                  {on ? '★' : '☆'} {l.name}
                </span>
                <span className="text-[11px] leading-snug text-stone-400">
                  {legendaryText(registry, l.id, l.max)}
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Attunement">
        <AttunementBars stats={stats} />
        <div className="flex flex-col gap-1" data-testid="extra-attunement">
          {MANA_TYPES.map((m) => {
            const extra = s.attunement[m] ?? 0;
            const style = manaStyle(registry, m);
            return (
              <label key={m} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0" style={{ color: style.color }}>
                  {style.icon} {style.name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={MAX_EXTRA_ATTUNE}
                  step={1}
                  value={extra}
                  onChange={(e) => s.setAttunement(m, Number(e.currentTarget.value))}
                  className="min-w-0 flex-1"
                  data-testid={`extra-attune-${m}`}
                />
                <span className="w-24 shrink-0 text-right text-stone-400">
                  {stats.attunement[m] - extra} + {extra} ={' '}
                  <b className="text-stone-100">{stats.attunement[m]}</b>
                </span>
              </label>
            );
          })}
        </div>
      </Section>

      <button
        type="button"
        className="delve-btn delve-btn-gold text-base"
        onClick={() => s.loadMyBuild(useDelveStore.getState().profile)}
        data-testid="load-my-build"
      >
        Load my build
      </button>
      <p className="text-[11px] text-stone-500">
        Copies your equipped gear and abilities in. Nothing here ever changes your save.
      </p>
    </div>
  );
});

/** The Anvil's editor, bound to the sandbox (never locked, every reaction named: it's a testing tool). */
const TrainingAbilities = memo(function TrainingAbilities() {
  const builds = useSandboxStore((s) => s.abilities);
  const stats = useSandboxStats();
  const all = getDelveRegistry()
    .getArpgData()
    .reactions.map((r) => r.id);
  return (
    <AbilityEditor
      builds={builds}
      stats={stats}
      reactionsSeen={all}
      locked={false}
      onChange={(slot, build) => useSandboxStore.getState().setAbility(slot, build)}
    />
  );
});

const TargetsTab = memo(function TargetsTab({ actions }: { actions: TrainingActions }) {
  const registry = getDelveRegistry();
  const biomes = registry.getDelveData().biomes;
  const dummyElement = useSandboxStore((s) => s.dummyElement);
  const full = useSandboxStore((s) => s.dummies.length >= MAX_DUMMY_GROUPS);
  const depth = useSandboxStore((s) => s.depth);
  const [biomeId, setBiomeId] = useState(biomes[0].id);
  const biome = biomes.find((b) => b.id === biomeId) ?? biomes[0];
  const defs = [...biome.monsters, biome.boss];
  const [defId, setDefId] = useState(defs[0].id);
  const def = defs.find((d) => d.id === defId) ?? defs[0];
  const [kind, setKind] = useState<MonsterKind>('normal');
  const [count, setCount] = useState(3);
  const store = useSandboxStore.getState;

  return (
    <div className="flex flex-col gap-4" data-testid="targets-tab">
      <Section title="Training dummies">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-stone-500">Resists</span>
          <Chip
            pressed={dummyElement === null}
            onClick={() => store().setDummyElement(null)}
            testId="dummy-element-none"
          >
            Neutral
          </Chip>
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={dummyElement === m}
              onClick={() => store().setDummyElement(m)}
              testId={`dummy-element-${m}`}
              title={`Resists ${manaStyle(registry, m).name}`}
            >
              {manaStyle(registry, m).icon}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {LAYOUTS.map(([layout, label]) => (
            <button
              key={layout}
              type="button"
              className="delve-btn px-2 py-2 text-xs"
              disabled={full}
              onClick={() => actions.addDummies(layout)}
              data-testid={`add-dummy-${layout}`}
            >
              {label}
            </button>
          ))}
        </div>
        {full && (
          <div className="text-[11px] text-amber-200" data-testid="dummies-full">
            {MAX_DUMMY_GROUPS} groups at most: clear the dummies to add more.
          </div>
        )}
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={actions.resetDummies}
          data-testid="reset-dummies"
        >
          ↺ Reset dummies
        </button>
      </Section>

      <Section title="Monsters">
        <select
          className={SELECT}
          value={biome.id}
          onChange={(e) => {
            const next = biomes.find((b) => b.id === e.currentTarget.value) ?? biomes[0];
            setBiomeId(next.id);
            setDefId(next.monsters[0].id);
          }}
          data-testid="spawn-biome"
        >
          {biomes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={def.id}
          onChange={(e) => setDefId(e.currentTarget.value)}
          data-testid="spawn-monster"
        >
          {defs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.icon} {d.name}
              {d.id === biome.boss.id ? ' (boss)' : ''}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map(([k, label]) => (
            <Chip key={k} pressed={kind === k} onClick={() => setKind(k)} testId={`spawn-kind-${k}`}>
              {label}
            </Chip>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-300">
          Count
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.currentTarget.value))}
            className="min-w-0 flex-1"
            data-testid="spawn-count"
          />
          <b className="w-4 text-right">{count}</b>
        </label>
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={() => actions.spawn(def.id, kind, count)}
          data-testid="spawn-button"
        >
          Spawn {count} × {def.name}
        </button>
      </Section>

      <Section title="Clear">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="delve-btn px-2 text-xs"
            onClick={() => actions.clear('monsters')}
            data-testid="clear-monsters"
          >
            Monsters
          </button>
          <button
            type="button"
            className="delve-btn px-2 text-xs"
            onClick={() => actions.clear('dummies')}
            data-testid="clear-dummies"
          >
            Dummies
          </button>
          <button
            type="button"
            className="delve-btn delve-btn-danger px-2 text-xs"
            onClick={() => actions.clear('all')}
            data-testid="clear-all"
          >
            All
          </button>
        </div>
      </Section>

      <Section title="Depth">
        <label className="flex items-center gap-2 text-sm text-stone-300">
          <select
            className={SELECT}
            value={depth}
            onChange={(e) => store().setDepth(Number(e.currentTarget.value))}
            data-testid="training-depth"
          >
            {Array.from({ length: MAX_DEPTH }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="text-xs text-stone-400">
            {registry.getBiomeForDepth(depth).name}: monsters and dummies scale with depth. A new
            depth restarts the arena (dummies come back, spawned monsters don&apos;t).
          </span>
        </label>
      </Section>
    </div>
  );
});

const TogglesTab = memo(function TogglesTab({
  actions,
  onOpenControls,
}: {
  actions: TrainingActions;
  onOpenControls: () => void;
}) {
  const toggles = useSandboxStore((s) => s.toggles);
  const slowmo = useSandboxStore((s) => s.slowmo);
  const manual = useDelveStore((s) => s.manualAttack);
  const store = useSandboxStore.getState;

  return (
    <div className="flex flex-col gap-4" data-testid="toggles-tab">
      <Section title="Rules">
        {SWITCHES.map(([key, label, text]) => (
          <button
            key={key}
            type="button"
            className="delve-panel flex items-center justify-between gap-3 p-2.5 text-left"
            aria-pressed={toggles[key]}
            onClick={() => store().setToggles({ ...toggles, [key]: !toggles[key] })}
            data-testid={`toggle-${key}`}
          >
            <span className="min-w-0">
              <span className="delve-display block text-sm font-bold text-stone-100">{label}</span>
              <span className="block text-[11px] text-stone-400">{text}</span>
            </span>
            <span
              className="delve-display shrink-0 text-xs font-bold"
              style={{ color: toggles[key] ? '#4ade80' : '#78716c' }}
            >
              {toggles[key] ? 'ON' : 'OFF'}
            </span>
          </button>
        ))}
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={actions.fillCharge}
          data-testid="fill-charge"
        >
          ⚡ Fill charge
        </button>
      </Section>

      <Section title="Slow motion">
        <div className="flex flex-wrap gap-1.5">
          {SLOWMO_SPEEDS.map((v) => (
            <Chip key={v} pressed={slowmo === v} onClick={() => store().setSlowmo(v)} testId={`slowmo-${v}`}>
              {v}×
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Controls">
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={() => useDelveStore.getState().setManualAttack(!manual)}
          data-testid="training-attack-mode"
        >
          Basic attack: {manual ? 'Manual' : 'Auto'} ⇄
        </button>
        <button
          type="button"
          className="delve-btn text-sm"
          onClick={onOpenControls}
          data-testid="training-open-controls"
        >
          🎮 Controls
        </button>
      </Section>
    </div>
  );
});

/**
 * The Training panel: docked beside the running fight (wide pages with mouse
 * and keyboard) or a sheet over the paused fight (phones, or a controller), as
 * the page decided when it opened. The sheet keeps the controller's focus
 * (`data-pad-scope`), its Close answers B (`data-pad-back`), LB/RB step the
 * tabs (`data-pad-tabs`), and Back to the Anvil (no marker) lets a controller
 * player leave from inside it. Memoised, with memoised tabs, so the HUD's and
 * the meter's refreshes don't re-render every tab.
 */
export const TrainingPanel = memo(function TrainingPanel({
  layout,
  tab,
  onTab,
  onClose,
  onExit,
  actions,
  meter,
  onOpenControls,
}: {
  layout: PanelLayout;
  tab: TrainingTab;
  onTab: (tab: TrainingTab) => void;
  onClose: () => void;
  onExit: () => void;
  actions: TrainingActions;
  meter: MeterSummary;
  onOpenControls: () => void;
}) {
  // A list picked with the pointer lets go of focus once it changes; one worked with keys keeps it.
  const pointerList = useRef<HTMLSelectElement | null>(null);
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    pointerList.current = (e.target as Element).closest('select');
  };
  const onKeyDown = () => {
    pointerList.current = null;
  };
  const onChange = (e: FormEvent<HTMLElement>) => {
    if (e.target instanceof HTMLSelectElement && e.target === pointerList.current) {
      pointerList.current = null;
      e.target.blur();
    }
  };

  const body = (
    <div
      className="flex flex-col gap-3"
      onPointerDown={onPointerDown}
      onPointerUp={blurOnPointerUp}
      onKeyDown={onKeyDown}
      onChange={onChange}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="delve-display text-lg font-bold uppercase tracking-widest text-amber-300">
          🎯 Training
        </span>
        <span className="flex gap-1.5">
          <button
            type="button"
            className="delve-btn px-3 py-1 text-sm"
            onClick={onExit}
            data-testid="training-panel-exit"
          >
            ◂ Anvil
          </button>
          {layout === 'sheet' && (
            <button
              type="button"
              className="delve-btn px-3 py-1 text-sm"
              onClick={onClose}
              data-pad-back
              data-testid="training-panel-close"
            >
              Close
            </button>
          )}
        </span>
      </div>
      <div className="flex gap-1 rounded-xl bg-black/30 p-1" role="tablist" data-pad-tabs>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className="delve-display flex-1 rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-wide"
            style={{
              background: tab === id ? 'linear-gradient(180deg,#2c2c3e,#1f1f2c)' : 'transparent',
              color: tab === id ? '#fde68a' : '#8a8a9a',
            }}
            data-testid={`training-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'loadout' && <LoadoutTab />}
      {tab === 'abilities' && <TrainingAbilities />}
      {tab === 'targets' && <TargetsTab actions={actions} />}
      {tab === 'toggles' && <TogglesTab actions={actions} onOpenControls={onOpenControls} />}
      {tab === 'meter' && <MeterTab meter={meter} onReset={actions.resetMeter} />}
    </div>
  );

  if (layout === 'dock')
    return (
      <aside
        className="absolute inset-y-0 right-0 z-30 overflow-y-auto border-l border-white/10 p-3"
        style={{ width: DOCK_WIDTH, background: 'linear-gradient(180deg,#16161f,#0e0e14)' }}
        data-testid="training-panel"
        data-layout="dock"
      >
        {body}
      </aside>
    );
  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/70 sm:items-center"
      data-pad-scope
    >
      <div
        className="delve-panel max-h-[88%] w-full max-w-[560px] overflow-y-auto p-3"
        style={{ paddingBottom: 'calc(12px + var(--spacing-safe-bottom))' }}
        data-testid="training-panel"
        data-layout="sheet"
      >
        {body}
      </div>
    </div>
  );
});
```

Notes for the implementer:
- The pointer rules sit on the panel's root, so they cover every control inside. The page reuses `blurOnPointerUp` for its top bar (Task 19).
- Everything is shown (all legendary powers with their text, reactions by name): the spoiler decision in the spec.
- `SLOWMO_SPEEDS` is a readonly tuple; `setSlowmo` takes a number.

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/features/delve/training/MeterView.tsx src/features/delve/training/TrainingPanel.tsx src/features/delve/__tests__/TrainingPanel.test.tsx && npx vitest run src/features/delve/__tests__/TrainingPanel.test.tsx && npx tsc --noEmit -p . && npx vitest run`
Expected: PASS; the whole client suite green.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/features/delve/training/MeterView.tsx packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): the Training panel: loadout, abilities, targets, toggles and meter tabs"
```

---

## Chunk 8: The page, the dummy sprite, E2E and shipping v0.41.0

### Task 19: The Training Grounds page, its route, and the Anvil button

**Files:**
- Create: `packages/client/src/pages/DelveTraining.tsx`
- Modify: `packages/client/src/App.tsx` (route), `packages/client/src/components/AppShell.tsx` (`hideTabBar`), `packages/client/src/pages/DelveCamp.tsx` (the button)
- Test: `packages/client/src/pages/__tests__/DelveCamp.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/pages/__tests__/DelveCamp.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DelveCamp } from '../DelveCamp';
import { useDelveStore } from '@/stores/delveStore';

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('DelveCamp', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    useDelveStore.getState().resetProfile(1234);
  });

  it('the Training Grounds button opens the sandbox, even with a dive under way', () => {
    useDelveStore.getState().startDive(1);
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    const button = screen.getByTestId('training-button');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mockNavigate).toHaveBeenCalledWith('/delve/training');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/pages/__tests__/DelveCamp.test.tsx`
Expected: FAIL (no `training-button`).

- [ ] **Step 3: The Anvil button, the route, the TabBar**

In `src/pages/DelveCamp.tsx`, inside the "Delve CTA" column, right after the `delve-button` `</button>`:

```tsx
            <button
              type="button"
              className="delve-btn py-2.5 text-base"
              onClick={() => navigate('/delve/training')}
              data-testid="training-button"
            >
              🎯 Training Grounds
            </button>
```

(Always enabled: the sandbox never touches the save.)

In `src/App.tsx`: `import { DelveTraining } from './pages/DelveTraining';` and, after the `/delve/run` route, `<Route path="/delve/training" element={<DelveTraining />} />`.

In `src/components/AppShell.tsx`:

```tsx
  // The Delve arena is full-screen: the joystick and ability buttons need the space.
  const hideTabBar = location.pathname === '/delve/run' || location.pathname === '/delve/training';
```

- [ ] **Step 4: The page**

Create `packages/client/src/pages/DelveTraining.tsx`:

```tsx
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useDelveStore } from '@/stores/delveStore';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import { useSandboxStore } from '@/stores/sandboxStore';
import { ControlsPanel } from '@/features/controls/ControlsPanel';
import { setArenaLive } from '@/features/gamepad/gamepad-hub';
import { ToastContainer } from '@/components/Toast';
import { ArenaControls } from '@/features/delve/arena/ArenaControls';
import {
  AttackButton,
  BossBar,
  keyHints,
  padHints,
  SkillBar,
  Vitals,
} from '@/features/delve/arena/ArenaHud';
import { noManaToaster, playArenaEvents } from '@/features/delve/arena/arena-sounds';
import type { CoreUiEvent } from '@/features/delve/arena/useArenaCore';
import { useTrainingArena, type TrainingArena } from '@/features/delve/training/useTrainingArena';
import { MeterChip } from '@/features/delve/training/MeterView';
import {
  DOCK_WIDTH,
  TrainingPanel,
  blurOnPointerUp,
  type PanelLayout,
  type TrainingTab,
} from '@/features/delve/training/TrainingPanel';
import '@/features/delve/delve.css';

/** From this page width, with mouse and keyboard, the panel docks beside the fight. */
const DOCK_MIN_WIDTH = 1024;

const fineMouse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

/**
 * Decided when the panel opens and kept until it closes: docked (the fight runs
 * on) when the page itself is wide enough (the app frame letterboxes, so not
 * the window) and mouse and keyboard are in use; otherwise a sheet that pauses it.
 */
function openLayout(page: HTMLElement | null): PanelLayout {
  return (page?.clientWidth ?? 0) >= DOCK_MIN_WIDTH &&
    useInputDeviceStore.getState().device === 'keyboard'
    ? 'dock'
    : 'sheet';
}

/**
 * The Training Grounds: the arena with the usual HUD, controls and sounds,
 * plus dummies, any monster, rule toggles and a damage meter, on a loadout of
 * its own. It never touches the Delve save.
 */
export function DelveTraining() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [insets, setInsets] = useState({ top: 60, bottom: 190 });
  const [panel, setPanel] = useState<PanelLayout | null>(null);
  const [tab, setTab] = useState<TrainingTab>('loadout');
  const [controlsOpen, setControlsOpen] = useState(false);
  const depth = useSandboxStore((s) => s.depth);

  // Docked and open on entry where it docks; otherwise closed until asked for.
  useLayoutEffect(() => {
    if (openLayout(pageRef.current) === 'dock') setPanel('dock');
  }, []);

  // Keep the camera clear of the HUD.
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      setInsets({
        top: topRef.current?.offsetHeight ?? 60,
        bottom: bottomRef.current?.offsetHeight ?? 190,
      });
    });
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    return () => ro.disconnect();
  }, []);

  const paused = panel === 'sheet' || controlsOpen;
  // A layout effect, so the controller changes owner in the same commit as the pause.
  useLayoutEffect(() => {
    setArenaLive(!paused);
    return () => setArenaLive(false);
  }, [paused]);
  const manualAttack = useDelveStore((s) => s.manualAttack);
  const device = useInputDeviceStore((s) => s.device);
  const controls = useControlsStore((s) => s.config);
  const hints = device === 'gamepad' ? padHints(controls) : fineMouse ? keyHints(controls) : null;

  // The dive's sounds, haptics and no-mana toast.
  const arenaRef = useRef<TrainingArena | null>(null);
  const noManaToast = useMemo(() => noManaToaster(), []);
  const onUi = useCallback(
    (e: CoreUiEvent) => {
      if (e.kind === 'events') playArenaEvents(e.events);
      else noManaToast(arenaRef.current?.hud?.abilities[e.slot]?.name);
    },
    [noManaToast],
  );
  const arena = useTrainingArena(hostRef, { paused, insets, onUi, manualAttack });
  arenaRef.current = arena;

  // Stable, so the memoised panel only re-renders for its own props (and the meter).
  const togglePanel = useCallback(() => {
    const next = openLayout(pageRef.current);
    setPanel((p) => (p ? null : next));
  }, []);
  const closePanel = useCallback(() => setPanel(null), []);
  const openControls = useCallback(() => setControlsOpen(true), []);
  const exit = useCallback(() => navigate('/delve'), [navigate]);

  return (
    <div ref={pageRef} className="delve-page select-none bg-black" data-testid="delve-training">
      {/* The arena and its HUD narrow beside a docked panel, so the camera centres in view. */}
      <div
        className="absolute inset-y-0 left-0"
        style={{ right: panel === 'dock' ? DOCK_WIDTH : 0 }}
      >
        <div ref={hostRef} className="absolute inset-0" data-testid="arena" />
        <ArenaControls
          input={arena.input}
          heroScreen={arena.heroScreen}
          pixelsPerUnit={arena.pixelsPerUnit}
          disabled={paused}
          manualAttack={manualAttack}
        />

        <div
          ref={topRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pb-3 pt-2"
          style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
          onPointerUp={blurOnPointerUp}
        >
          <div className="mx-auto flex max-w-[640px] items-center gap-2">
            <button
              type="button"
              className="delve-btn pointer-events-auto px-2.5 py-1.5 text-sm"
              onClick={exit}
              data-testid="training-back"
            >
              ◂ Anvil
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
              <span
                className="delve-display whitespace-nowrap text-[11px] font-semibold uppercase tracking-widest text-stone-400"
                data-testid="training-depth-label"
              >
                Depth {depth}
              </span>
              <MeterChip meter={arena.meter} onReset={arena.actions.resetMeter} />
            </div>
            <button
              type="button"
              className="delve-btn pointer-events-auto px-2.5 py-1.5 text-sm"
              aria-expanded={panel !== null}
              onClick={togglePanel}
              data-pad-menu
              data-testid="training-panel-toggle"
            >
              ☰ Panel
            </button>
          </div>
        </div>
        <BossBar hud={arena.hud} />

        <div
          ref={bottomRef}
          className="absolute inset-x-0 bottom-0 z-20 px-3 pt-6"
          style={{
            background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 55%, rgba(0,0,0,0))',
            paddingBottom: 'calc(10px + var(--spacing-safe-bottom))',
            pointerEvents: 'none',
          }}
        >
          <div className="pointer-events-auto mx-auto flex max-w-[520px] flex-col gap-2">
            <Vitals hud={arena.hud} />
            {manualAttack && (!fineMouse || device === 'gamepad') && (
              <div className="flex justify-end pr-1">
                <AttackButton hud={arena.hud} onAttack={arena.attack} hint={hints?.attack} />
              </div>
            )}
            <SkillBar
              hud={arena.hud}
              onCast={arena.cast}
              onAim={arena.aim}
              onPotion={arena.potion}
              onDodge={arena.dodge}
              hints={hints}
            />
          </div>
        </div>
      </div>

      {panel && (
        <TrainingPanel
          layout={panel}
          tab={tab}
          onTab={setTab}
          onClose={closePanel}
          onExit={exit}
          actions={arena.actions}
          meter={arena.meter}
          onOpenControls={openControls}
        />
      )}
      {/* After the panel: the controller's back button and focus go to the topmost one. */}
      {controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}
      <ToastContainer />
    </div>
  );
}
```

How the spec's open/close rules land:
- The layout is read from the page's own width (`pageRef.current.clientWidth`): between 9:16 and 3:2 the app frame letterboxes, so the window is wider than the page. The first layout effect opens the dock where it docks, before the first paint; the core's host `ResizeObserver` (Task 9) resizes the canvas as the arena narrows.
- The Panel button (`training-panel-toggle`) carries `data-pad-menu`, so the controller's Menu presses it (through the arena while the fight is live, through the menu layer while a sheet pauses it), and so does the keyboard's menu key (Escape by default) from anywhere, sliders and lists included (Task 14).
- The sheet's Close carries `data-pad-back`; both **◂ Anvil** buttons (the top bar's, and the panel header's for a controller player inside the sheet) carry neither marker.
- `paused` is a sheet or the Controls editor: a docked panel leaves the fight running (and the controller with the arena).
- The HUD refreshes the page at 12.5 Hz and the meter at 4 Hz; the panel's props are stable apart from `meter`, and its tabs are memoised, so only the shell and the Meter tab re-render with them.
- The TabBar is hidden here (Step 3).

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/client && npx prettier --write src/pages/DelveTraining.tsx src/pages/DelveCamp.tsx src/components/AppShell.tsx src/pages/__tests__/DelveCamp.test.tsx && npx tsc --noEmit -p . && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/pages/DelveTraining.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/App.tsx packages/client/src/components/AppShell.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the Training Grounds page, reached from the Anvil"
```

---

### Task 20: The training dummy sprite

**Files:**
- Create: `packages/pixel-forge/art/alloy/sprites/dummy.ts`
- Modify: `packages/pixel-forge/art/alloy/manifest.json` (a `dummy` entry)
- Rebuilt: `packages/pixel-forge/art/alloy/review.png`, `packages/client/public/sprites/delve/atlas.png`, `packages/client/public/sprites/delve/atlas.json`
- Test: `packages/client/src/features/delve/__tests__/sprite-atlas.test.ts`

- [ ] **Step 1: Write the failing test**

In `sprite-atlas.test.ts`, after the `monsterIds` set:

```ts
  /** Everything the arena draws from the atlas: the hero, the training dummy (size 1) and the monsters. */
  const known = new Set(['hero', 'dummy', ...monsterIds]);
```

- "only holds sprites the game can use": `expect(id === 'hero' || monsterIds.has(id), \`unknown sprite "${id}"\`).toBe(true);` becomes `expect(known.has(id), \`unknown sprite "${id}"\`).toBe(true);`.
- Rename "covers the hero and the whole first biome" to "covers the hero, the training dummy and the whole first biome", and its list `['hero', ...first.monsters.map((m) => m.id), first.boss.id]` becomes `['hero', 'dummy', ...first.monsters.map((m) => m.id), first.boss.id]`.
- In the density test, after `sizes.set('hero', 1);` add `sizes.set('dummy', 1);`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/sprite-atlas.test.ts`
Expected: FAIL (the atlas has no `dummy` animation).

- [ ] **Step 3: Draw it**

Create `packages/pixel-forge/art/alloy/sprites/dummy.ts`. Size 1 → a 16 × 16 canvas; the art is 16 rows tall and sits bottom-centre. Two frames: in the second the sack head leans one pixel right (a slight sway; the post stays put, because both frames centre the same way: 13 and 14 columns wide both start at x = 1). Colours are ENDESGA 32.

```ts
import type { CodeSprite } from '../../../src/draw';

/** Training Dummy: a straw dummy on a post with a target on its chest; its sack head sways. */
const dummy: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    S: '#e4a672', // burlap
    s: '#feae34', // straw
    b: '#b86f50', // burlap shade
    t: '#c28569', // rope
    r: '#e43b44', // target red
    o: '#ffffff', // target white
    w: '#733e39', // post
    W: '#3e2731', // base
  },
  // prettier-ignore
  frames: [
    [
      '....kkkkk....',
      '...kSSSSbk...',
      '...kSkSkbk...',
      '...kSSSSbk...',
      '....kbSbk....',
      'kkkkktttkkkkk',
      'kssSSrrrSbssk',
      'kkkSrooorbkkk',
      '..kSrororbk..',
      '..kSrooorbk..',
      '..kSSrrrSbk..',
      '..kSsSSsSbk..',
      '...kSSsSbk...',
      '....kkwkk....',
      '.....kwk.....',
      '...kWWwWWk...',
    ],
    [
      '.....kkkkk....',
      '....kSSSSbk...',
      '....kSkSkbk...',
      '....kSSSSbk...',
      '.....kbSbk....',
      'kkkkktttkkkkk.',
      'kssSSrrrSbssk.',
      'kkkSrooorbkkk.',
      '..kSrororbk...',
      '..kSrooorbk...',
      '..kSSrrrSbk...',
      '..kSsSSsSbk...',
      '...kSSsSbk....',
      '....kkwkk.....',
      '.....kwk......',
      '...kWWwWWk....',
    ],
  ],
};

export default dummy;
```

(Rows 0–4 are the sack head with stitched eyes; row 5 the shoulders and the rope at the neck; rows 6–12 the straw body with straw arms on row 6 and a red-and-white bullseye on the chest; rows 13–15 the post and its base.)

In `packages/pixel-forge/art/alloy/manifest.json`, after the `hero` asset's closing `},` add:

```json
    {
      "id": "dummy",
      "size": 16,
      "subject": "a straw training dummy on a wooden post with a red and white target on its chest",
      "source": "code",
      "file": "sprites/dummy.ts"
    },
```

- [ ] **Step 4: Build the atlas and look at it**

Run: `pnpm -F @alloy/pixel-forge forge build`
Expected: `Packed 32 sprites …` (31 before, plus the dummy).

Open `packages/pixel-forge/art/alloy/review.png` (Read it) and check the dummy reads as a straw dummy with a target, the same pixel size as the hero. Adjust the rows if something reads poorly, and rebuild.

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/client && npx vitest run src/features/delve/__tests__/sprite-atlas.test.ts`
Expected: PASS (the dummy is 16 × 16, two frames).

Run: `pnpm -F @alloy/pixel-forge typecheck && pnpm -F @alloy/pixel-forge test`
Expected: clean (its tsconfig includes `art/`, so the sprite file is type-checked); all pixel-forge tests pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write packages/pixel-forge/art/alloy/sprites/dummy.ts
git add packages/pixel-forge/art/alloy/sprites/dummy.ts packages/pixel-forge/art/alloy/manifest.json packages/pixel-forge/art/alloy/review.png packages/client/public/sprites/delve/atlas.png packages/client/public/sprites/delve/atlas.json packages/client/src/features/delve/__tests__/sprite-atlas.test.ts
git commit -m "art: a training dummy sprite"
```

---

### Task 21: The Training Grounds E2E

**Files:**
- Create: `packages/client/e2e/delve-training.spec.ts`

- [ ] **Step 1: Write the spec**

Create `packages/client/e2e/delve-training.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile } from '@alloy/engine';

/** Loading the arena (Pixi, sprites) can be slow when many test browsers run at once. */
const ARENA_READY = 30_000;

/**
 * A fresh Delve save, no sandbox save (so the sandbox starts from its
 * defaults), and manual basic attacks (`MANUAL_ATTACK_KEY` in delveStore.ts),
 * so with nothing clicking the arena the Primary is the only damage.
 */
async function seed(page: Page): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), 4242));
  await page.addInitScript((value) => {
    if (sessionStorage.getItem('training-e2e')) return;
    localStorage.clear();
    localStorage.setItem('alloy:delve:v2', value);
    localStorage.setItem('alloy:delve:manualAttack', '1');
    localStorage.setItem('alloy:muted', 'true');
    sessionStorage.setItem('training-e2e', '1');
  }, save);
}

/** Open the Training panel: docked (and open already) on desktop, a sheet on phones. */
async function openPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if (!(await panel.isVisible())) await page.getByTestId('training-panel-toggle').click();
  await expect(panel).toBeVisible();
}

/** Close a sheet so the fight runs again (a docked panel stays open). */
async function resume(page: Page): Promise<void> {
  const panel = page.getByTestId('training-panel');
  if ((await panel.getAttribute('data-layout')) === 'sheet')
    await page.getByTestId('training-panel-close').click();
  await expect(page.getByTestId('ability-0')).toBeVisible();
}

test.describe('Delve Training Grounds', () => {
  test('T01: add a dummy, switch the weapon, fire the Primary, and the meter counts it', async ({
    page,
  }) => {
    await seed(page);
    await page.goto('/delve');
    await page.getByTestId('training-button').click();
    await expect(page.getByTestId('delve-training')).toBeVisible({ timeout: ARENA_READY });
    await expect(page.locator('[data-testid="arena"] canvas')).toBeVisible({
      timeout: ARENA_READY,
    });
    const ability0 = page.getByTestId('ability-0');
    await expect(ability0).toBeVisible({ timeout: ARENA_READY });

    await openPanel(page);
    await page.getByTestId('training-tab-targets').click();
    await page.getByTestId('add-dummy-single').click();
    await page.getByTestId('training-tab-loadout').click();
    await page.getByTestId('weapon-base-staff').click();
    await expect(page.getByTestId('weapon-name')).toContainText('Staff');
    await resume(page);

    const total = async () =>
      Number(await page.getByTestId('meter-total').getAttribute('data-total'));
    // The Primary auto-aims at the dummy. A slow frame can turn a click into a cancelled
    // aim, so press again until the meter counts a hit.
    await expect(async () => {
      await ability0.click();
      expect(await total()).toBeGreaterThan(0);
    }).toPass({ timeout: ARENA_READY });

    await openPanel(page);
    await page.getByTestId('training-tab-meter').click();
    await expect
      .poll(async () => Number(await page.getByTestId('meter-q').getAttribute('data-hits')), {
        timeout: ARENA_READY,
      })
      .toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it, with the dive suites as the regression guard**

Restart the dev server on port 5288 (see the header) and recreate the scratch config.

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve-training.spec.ts`
Expected: T01 passes on all four device projects (desktop docks the panel; the phones use the sheet).

Run: `cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts`
Expected: all pass (the dive's sounds now come from the shared helper; its behaviour is unchanged).

A consistent failure is a real bug: debug it with the page's console and state (the world key, the panel layout, `meter-total`), not with longer timeouts. Keep the scratch config for Task 22.

- [ ] **Step 3: Commit**

```bash
npx prettier --write packages/client/e2e/delve-training.spec.ts
git add packages/client/e2e/delve-training.spec.ts
git commit -m "test(e2e): the Training Grounds"
```

---

### Task 22: Docs, version, full verification, push

**Files:**
- Modify: `CLAUDE.md` (Delve section), `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md` (status line), `packages/client/package.json` (version)

- [ ] **Step 1: Docs and version**

In `CLAUDE.md`, Delve section:
- In the **Engine** bullet, `` `dodge.ts` the dodge, its charges and perfect dodges)`` becomes `` `dodge.ts` the dodge, its charges and perfect dodges; `sandbox.ts` the Training Grounds)``.
- Before the **Test hooks** bullet, add:

  ```markdown
  - **Training Grounds** (`/delve/training`, `pages/DelveTraining.tsx`; spec: `docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md`): a sandbox behind the Anvil's 🎯 button, always open, that never touches the save. It keeps its own loadout (`stores/sandboxStore.ts`, `alloy:delve:sandbox:v1`): any weapon base, element and rarity (`sandboxWeapon`), legendary powers and extra attunement (`computeHeroStats(equipped, registry, extra)`), the three builds, or **Load my build**. The engine's `arpg/sandbox.ts` builds an arena that never clears and drops nothing (`createSandboxWorld`), stands training dummies that never act or die (`spawnDummies`, `resetDummies`; their layout is `balance.json → delve.sandbox`), spawns any monster (`spawnMonsters`, `clearMonsters`), and keeps the toggles on `ArpgWorld.sandbox` (`setSandboxToggles`: infinite mana, no cooldowns, invulnerable; `fillCharge`, `respawnHero`). Builds hot-swap mid-fight (`refreshWorldHero` cancels a changed slot's wind-up), and `hit` events carry `source` and `slot` for the damage meter (`features/delve/training/meter.ts`). The dive and the sandbox share one arena core (`arena/useArenaCore.ts`: the dive mode is `useArena.ts`, the sandbox `features/delve/training/useTrainingArena.ts`) and one set of arena sounds (`arena/arena-sounds.ts`).
  ```

In the spec, `**Status:** Approved in conversation.` becomes `**Status:** Built in v0.41.0.`

In `packages/client/package.json`: `"version": "0.40.1"` becomes `"version": "0.41.0"`.

- [ ] **Step 2: Full verification**

Run, and check each is green before claiming anything:
- `cd packages/engine && npx vitest run && npx tsc --noEmit -p .` (the pacing guard rails included)
- `pnpm -F @alloy/engine build`
- `cd packages/client && npx tsc --noEmit -p . && npx vitest run`
- `pnpm -F @alloy/pixel-forge typecheck && pnpm -F @alloy/pixel-forge test`
- The Delve E2E through the scratch config, on a freshly restarted dev server: `e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts`.

Expected: all green (retry only proven flakes, as in the header). Then delete the scratch config, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 3: Commit and push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-26-delve-training-grounds-design.md packages/client/package.json
git commit -m "docs: the Training Grounds in the Delve notes

chore(client): bump version to 0.41.0"
git push -q origin claude/alloy-loot-gear-system-6upsy5
```

`git status` must show nothing but the three untracked 2026-05-01 plan docs.
