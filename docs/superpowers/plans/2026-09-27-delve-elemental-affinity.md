# Delve Elemental Affinity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Delve hero a two-element pair (`profile.pair`): a primary chosen on first visit and a bound secondary, that limits attunement and abilities to those two, makes basic blows strike with the primary while the combo's finisher discharges the secondary, lets an invested secondary overtake the primary between dives, and adds Mana Dust (from salvaging off-pair gear) for Re-attune and Realign.

**Architecture:** The engine owns every rule: save version 4 (`pair`, `manaDust`, a v2 → v3 → v4 migration that picks the primary and fixes builds), a new `src/delve/pair.ts` (choose, bind, realign, overtake, re-attune, build fixing, `profileStats`, `salvageDust`), `computeHeroStats` extras `pair` (basics: `weapon.element`/`infusion`/`blowPower`/`finisherPower`) and `filterAttunement` (the two-element limit), a finisher discharge in `basic.ts`, pair-leaning drops in `rollMana`, and an autopilot that binds, builds from both and overtakes. The client only calls those ops: a "Choose your mana" modal, a Mana view on the Abilities tab, a bind prompt in the item sheet, Re-attune, a pair-limited element picker, toasts drained from a store `notices` queue, per-blow visuals (`basicMotif`, a hand flare for ranged finishers, a secondary-tinted finisher wind-up), and a Training Grounds `primary`.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom), React 19, Zustand 5, Zod 3, PixiJS 8 (untouched here but for the renderer's event handler), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (the requirements; read it first). It builds on `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md` (v0.42.x): `HeroWeapon.infusion`, the motif carriers in `arena/fx/`, and the Training Grounds' Basic infusion picker.

---

**Conventions:**
- Windows 11. The Bash tool runs POSIX sh; PowerShell is also available (use it for process management). Run any Python helper script from a file (not a heredoc) with `PYTHONIOENCODING=utf-8`.
- Branch `claude/alloy-loot-gear-system-6upsy5` (already checked out). Every commit message ends with a blank line and then `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (the `git commit` blocks below show only the subject and body; add the trailer).
- Stage files by path. Never `git add -A` or `git add .` at the repo root: three unrelated untracked plan docs (`docs/superpowers/plans/2026-05-01-*.md`) exist and must stay out. v0.42.1 work may also leave `pixel/arena-effects.ts`, `pixel/floor-engine.ts` and their tests modified in the tree: never stage or edit them here.
- Push only at the very end, with `git push -q origin claude/alloy-loot-gear-system-6upsy5`. Never open a PR.
- **The engine is rebuilt once, in Task 12.** Chunks 1–3 change engine `src` and run only engine checks; don't run `pnpm -F @alloy/engine build` before Task 12 (the user plays on the 5288 dev server, and the client only compiles against the new engine once Task 12 has moved its callers). If you must rebuild later (a tuning fix), restart the dev server after.
- `tests/delve-pacing.test.ts` is the balance gate: it must pass at the end of Chunk 3 (Task 11) and stay green after.
- **Run every command from the repo root.** The shell's working directory persists between commands, so every command line below runs in a subshell (`(cd packages/engine && npx vitest run …)`), and every commit block starts with `cd /c/Projects/Alloy`.
- **Prettier:** the commit blocks format only files a task creates, or files that were Prettier-clean when this plan was written. These existing files are not clean at HEAD: edit them by hand in their existing style and never format them: `packages/engine/src/delve/{dive,profile-schema,autopilot}.ts`, `packages/engine/src/loot/{item-generator,drops}.ts`, `packages/engine/src/arpg/abilities/resolve.ts`, `packages/engine/tests/{delve-dive,delve-pacing,delve-loot}.test.ts`, `packages/client/src/features/delve/{BagPanel,LootTray}.tsx`, `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`. Before formatting any other existing file, `npx prettier --check <file>` must pass on it before your edit; never commit a whole-file reformat. Never run Prettier on a folder, JSON data files or Markdown; edit JSON by hand, keeping its one-line-per-group layout.
- `src/delve/pair.ts` and `profile.ts` / `dive.ts` import each other's functions (a function-level cycle, like `arpg/combat.ts` ↔ `arpg/abilities/defend.ts`): keep `pair.ts` to `export function` declarations and never call an import at module top level. Likewise `ManaPanel.tsx` ↔ `AbilitiesPanel.tsx` (components used at render time only).
- Engine `tsc` covers `src` only; client `tsc` covers `src` including tests, so client test code must type-check.
- Client store tests live in `src/stores/` (not `__tests__`).
- Geometry the engine tests rely on: the fixture arena's hero starts at (13, 36) facing up (−y); `dummy(x, y)` is a sturdy foe that doesn't fight back; a sword reaches 1.9, a staff 8.5.

**Commands:**

| What | Command (from repo root) |
|---|---|
| One engine test file | `(cd packages/engine && npx vitest run tests/<file>.test.ts)` |
| All engine tests | `(cd packages/engine && npx vitest run)` |
| Engine typecheck | `(cd packages/engine && npx tsc --noEmit -p .)` |
| Engine build | `pnpm -F @alloy/engine build` |
| Client typecheck + tests | `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)` |
| One client test file | `(cd packages/client && npx vitest run <path>)` |
| E2E | `(cd packages/client && npx playwright test -c playwright.scratch.config.ts <specs>)` |

**Dev server on 5288** (PowerShell; stops whatever owns the port, starts a detached Vite, waits for a 200 and prints `True`; leave it running when done):

```powershell
try { $ids = (Get-NetTCPConnection -LocalPort 5288 -State Listen -ErrorAction Stop).OwningProcess | Select-Object -Unique; foreach ($id in $ids) { Stop-Process -Id $id -Force -Confirm:$false } } catch {}
Start-Process -WindowStyle Hidden -WorkingDirectory 'C:\Projects\Alloy\packages\client' -FilePath 'cmd.exe' -ArgumentList '/c npx vite --port 5288 --strictPort --force --host'
$ok = $false; for ($i = 0; $i -lt 90 -and -not $ok; $i++) { try { $ok = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5288').StatusCode -eq 200 } catch { Start-Sleep -Milliseconds 500 } }; $ok
```

**E2E scratch config** (Tasks 19–20; create it when needed, delete it at the end, never commit it): `packages/client/playwright.scratch.config.ts`

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
| `src/data/balance.json`, `src/data/schemas.ts`, `src/types/delve.ts` | `delve.pair` numbers (Zod-validated, typed on `DelveBalance`) |
| `src/data/delve.json` | Prism's text |
| `src/types/delve.ts` | `ManaPair`; `DelveProfile.version: 4`, `pair`, `manaDust`; `HeroWeapon.blowPower`, `finisherPower` (and the `element`/`infusion` docs) |
| `src/types/arpg.ts` | `LootContext.pair` |
| `src/delve/hero-stats.ts` | `pairElements`, `itemAttunement`, `attuneElement`; `HeroStatsExtra.pair` + `filterAttunement` (replacing `basicInfusion`); the pair's basics in `computeHeroStats`; `estimateCombat` values blows and the finisher; `compareItem`/`heroPower` take a `pair` |
| `src/delve/pair.ts` (new) | `BuildFix`, `inPair`, `profileStats`, `fixBuildsToPair`, `chooseStartingMana`, `bindSecondary`, `realign`, `resolveOvertake`, `reattuneItem`, `salvageDust` |
| `src/delve/profile-schema.ts` | frozen `DelveProfileV3Schema`; v4 `DelveProfileSchema` (`pair` refined, `manaDust`); v2 from v3 |
| `src/delve/profile.ts` | `createDelveProfile(registry, seed, opts?)`; `parseDelveProfile(registry, raw)` → `{ profile, fixed }` (v2 → v3 → v4); `ProfileActionResult.fixed`; `replaceItem` exported; pair-aware Power, `equipBest`, `salvageCandidates`, `setAbility`; Mana Dust in `addLootToBag` / `salvageItems` |
| `src/delve/dive.ts` | `beginFloor` (`profileStats`, `loot.pair`), `heroMaxHp`, `BankResult.dust` |
| `src/delve/autopilot.ts` | `AutopilotOptions.primary`; `betweenDives` (overtake, bind, Primary from both, forge); pair-aware refresh and comparisons |
| `src/arpg/abilities/resolve.ts` | `defaultAbilities`: the Ward takes the element too |
| `src/arpg/basic.ts` | `BASIC_STATUS` exported; blows × `blowPower`; the finisher discharges the secondary (always its status, Twin Fang too, ranged shots too); `burstShot`'s infusion guard |
| `src/loot/item-generator.ts`, `src/loot/drops.ts` | `pair` in `ItemGenOptions` / `DropContext`; `rollMana` leans to it |
| `src/arpg/combat.ts`, `src/arpg/sandbox.ts` | pass / set `loot.pair` |
| `src/index.ts` | the new exports |
| `tests/delve-pair.test.ts` (new) | every engine test for this feature |
| `tests/delve-infusion.test.ts` | the weapon-infusion test reads the pair |
| `tests/delve-dive.test.ts`, `tests/delve-profile-abilities.test.ts` | version 4, `parseDelveProfile(registry, raw)`, the Fire Ward |
| `tests/delve-pacing.test.ts` | a Frost-primary run |
| `tests/fixtures/arena.ts`, `tests/arpg-sim.test.ts` | `loot.pair: []` |

**Client (`packages/client/`)**

| File | Change |
|---|---|
| `package.json` | version `0.43.0` |
| `src/stores/delveStore.ts` (+ test) | `loadDelveProfile` → `{ profile, fixed }`; `resetProfile(seed, primary)`; `chooseMana`, `bindSecondary`, `realign`, `reattune`, `declineBind`; `closeDive` resolves an overtake; `notices` / `takeNotices`; `fixNotice`, `overtakeNotice` |
| `src/stores/sandboxStore.ts` (+ test) | saved `primary`; a basics-only pair; the infusion rules keyed off `primary`; Load my build copies the pair |
| `src/features/delve/useDelveNotices.ts` (new) | drains `notices` into toasts |
| `src/features/delve/ManaChoice.tsx` (new) | the "Choose your mana" modal |
| `src/features/delve/ManaPanel.tsx` (new) | the Mana view (pair, bars, overtake, Mana Dust, Bind, Realign) |
| `src/features/delve/BindPrompt.tsx` (new) | the bind prompt |
| `src/features/delve/AbilitiesPanel.tsx` | `AttunementBars` `elements`; `AbilityEditor` `elements` (the picker) and `mana` (the Mana view slot); the Anvil wrapper uses `profileStats` |
| `src/features/delve/ItemDetailSheet.tsx` | pair-aware compare; greyed off-pair attunement; salvage's Mana Dust; Re-attune; the bind prompt and the mid-dive toast |
| `src/features/delve/PaperDoll.tsx`, `BagPanel.tsx`, `LootTray.tsx`, `arena/PickupFeed.tsx`, `arena/useArena.ts` | `profileStats` / the pair in `compareItem` |
| `src/pages/DelveCamp.tsx`, `src/pages/DelveRun.tsx` | the pair's attunement strip, `ManaChoice`, notices |
| `src/features/delve/arena/fx/infusion.ts` | `basicMotif` |
| `src/features/delve/arena/fx/mana-fx.ts` | `finisherRing` flares at the hand for a ranged finisher |
| `src/features/delve/arena/fx/draw-world.ts`, `fx/anticipation.ts`, `arena/ArenaRenderer.ts` | per-blow motifs, the ranged discharge, the finisher's wind-up tint |
| `src/features/delve/training/TrainingPanel.tsx` | the primary picker; the infusion picker keyed off it (and open unarmed); its label |
| tests | `pages/__tests__/DelveCamp.test.tsx`, `features/delve/__tests__/{AbilitiesPanel,ItemDetailSheet,ManaPanel (new),TrainingPanel}.test.tsx`, `arena/fx/__tests__/{infusion,mana-fx,anticipation}.test.ts` |
| `e2e/delve.spec.ts`, `e2e/delve-gamepad.spec.ts`, `e2e/delve-training.spec.ts` | seed a pair; the Fire Ward; a nature bind for D04; D08 (the choice screen) |

`pages/MainMenu.tsx` needs no edit: its Power comes from `profilePower`, which reads the pair after Task 6.

**Docs:** `CLAUDE.md` (an Elemental affinity bullet, schema version 4, the infusion line), the spec's status line.

---

## Chunk 1: Engine: balance, stats, save v4

### Task 1: The `delve.pair` balance and Prism's text

**Files:**
- Modify: `packages/engine/src/data/balance.json` (`delve`)
- Modify: `packages/engine/src/data/schemas.ts` (`DelveBalanceSchema`)
- Modify: `packages/engine/src/types/delve.ts` (`DelveBalance`)
- Modify: `packages/engine/src/data/delve.json` (the `prism` legendary)
- Create: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 0: Commit the plan**

If `git status` shows this plan untracked, commit it first so every later commit stays about code:

```bash
cd /c/Projects/Alloy
git add docs/superpowers/plans/2026-09-27-delve-elemental-affinity.md
git commit -m "docs: Delve elemental affinity plan"
```

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/delve-pair.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { bal, registry } from './fixtures/arena.js';

describe('balance: delve.pair', () => {
  it("loads the pair's numbers, and Prism speaks of your two elements", () => {
    expect(bal.pair).toEqual({
      overtakeMargin: 1.2,
      basicPowerPerAttune: 0.03,
      dropBias: 0.6,
      primaryShare: 0.6,
      salvageDust: { common: 1, uncommon: 2, magic: 3, rare: 5, epic: 8, legendary: 15 },
      reattuneDust: { common: 2, uncommon: 3, magic: 5, rare: 8, epic: 12, legendary: 20 },
      realignDust: 60,
      realignScrap: 200,
    });
    expect(registry.getLegendary('prism').text).toBe(
      '+{v} to the Attunement of your two elements.',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`bal.pair` is `undefined`: Zod strips unknown keys, and there is none yet).

- [ ] **Step 3: Implement**

`src/data/balance.json`, in `delve`, after the `"mana": { … }` block's closing `},` (before `"status"`), add:

```json
    "pair": {
      "overtakeMargin": 1.2, "basicPowerPerAttune": 0.03, "dropBias": 0.6, "primaryShare": 0.6,
      "salvageDust": { "common": 1, "uncommon": 2, "magic": 3, "rare": 5, "epic": 8, "legendary": 15 },
      "reattuneDust": { "common": 2, "uncommon": 3, "magic": 5, "rare": 8, "epic": 12, "legendary": 20 },
      "realignDust": 60, "realignScrap": 200
    },
```

`src/data/schemas.ts`, in `DelveBalanceSchema`, after the `mana: z.object({ … }),` entry, add:

```ts
  pair: z.object({
    overtakeMargin: z.number().min(1),
    basicPowerPerAttune: z.number().min(0),
    dropBias: z.number().min(0).max(1),
    primaryShare: z.number().min(0).max(1),
    salvageDust: perRarity(z.number().int().min(0)),
    reattuneDust: perRarity(z.number().int().min(0)),
    realignDust: z.number().int().min(0),
    realignScrap: z.number().int().min(0),
  }),
```

`src/types/delve.ts`, in `DelveBalance`, after the `mana: { … };` member, add:

```ts
  /** Elemental affinity: the hero's two elements (see the elemental affinity spec). */
  pair: {
    /** Between dives, a bound secondary above this × the primary's attunement (and above 0) swaps in. */
    overtakeMargin: number;
    /** Basic blows gain this much damage per point of attunement in the element they strike with. */
    basicPowerPerAttune: number;
    /** Chance a drop takes one of the pair's elements (else the biome lean and a uniform roll). */
    dropBias: number;
    /** Of those, the share that takes the primary once a secondary is bound. */
    primaryShare: number;
    /** Mana Dust from salvaging an item outside the pair, by rarity. */
    salvageDust: Record<Rarity, number>;
    /** Mana Dust to re-attune an item to the pair's other element, by rarity. */
    reattuneDust: Record<Rarity, number>;
    /** What a Realign costs. */
    realignDust: number;
    realignScrap: number;
  };
```

`src/data/delve.json`, the `prism` legendary: `"text": "+{v} to every Attunement.",` becomes `"text": "+{v} to the Attunement of your two elements.",`.

- [ ] **Step 4: Run to verify it passes**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts tests/balance-schema.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/data/balance.json packages/engine/src/data/schemas.ts packages/engine/src/types/delve.ts packages/engine/src/data/delve.json packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): delve.pair balance, and Prism attunes your two elements"
```

---

### Task 2: Stats: the pair's basics and the two-element limit

**Files:**
- Modify: `packages/engine/src/types/delve.ts` (`ManaPair`, `HeroWeapon`)
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/tests/delve-infusion.test.ts` (the first `describe`)
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`, replace the imports with:

```ts
import { describe, it, expect } from 'vitest';
import {
  computeAttunement,
  computeHeroStats,
  type HeroStatsExtra,
} from '../src/delve/hero-stats.js';
import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../src/types/gear.js';
import type { ManaType } from '../src/types/mana.js';
import { bal, gear, registry } from './fixtures/arena.js';

/** A plain item of `mana`: no implicits, and only the lines given (as affixes). */
function item(
  mana: ManaType,
  slot: GearSlot = 'ring',
  lines: [HeroStatKey, number][] = [],
  rarity: Rarity = 'common',
): GearItem {
  return {
    uid: `${mana}-${slot}`,
    slot,
    baseId: registry.getGearBasesForSlot(slot)[0].id,
    rarity,
    mana,
    ilvl: 3,
    name: 'Test',
    implicits: [],
    affixes: lines.map(([stat, value]) => ({ stat, value, roll: 0.5 })),
    upgrade: 0,
    reforges: 0,
    locked: false,
  };
}
```

and append:

```ts
describe('stats with a pair', () => {
  const k = bal.pair.basicPowerPerAttune;

  it('filtered, attunement counts per element, only for the pair', () => {
    const equipped = {
      weapon: item('fire', 'weapon'), // fire 1
      ring: item('frost', 'ring', [
        ['stormAttune', 2], // an off-pair item's in-pair line counts
        ['frostAttune', 3],
      ]),
      amulet: item('storm', 'amulet', [['natureAttune', 4]]), // an in-pair item's off-pair line doesn't
    };
    const pair = { primary: 'fire', secondary: 'storm' } as const;
    expect(computeAttunement(equipped, registry, { pair, filterAttunement: true })).toEqual({
      fire: 1,
      frost: 0,
      storm: 3,
      earth: 0,
      shadow: 0,
      nature: 0,
    });
    const all = { fire: 1, frost: 4, storm: 3, earth: 0, shadow: 0, nature: 4 };
    expect(computeAttunement(equipped, registry, { pair })).toEqual(all);
    const none = { primary: null, secondary: null };
    expect(computeAttunement(equipped, registry, { pair: none, filterAttunement: true })).toEqual(
      all,
    );
  });

  it('Prism adds to the pair only', () => {
    const ring = { ...item('fire', 'ring'), legendary: { id: 'prism', value: 2, roll: 1 } };
    const pair = { primary: 'fire', secondary: 'storm' } as const;
    expect(computeAttunement({ ring }, registry, { pair, filterAttunement: true })).toEqual({
      fire: 3,
      frost: 0,
      storm: 2,
      earth: 0,
      shadow: 0,
      nature: 0,
    });
  });

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
    const paired = weapon({ pair: { primary: 'fire', secondary: 'frost' }, attunement: { fire: 4 } });
    expect(paired).toMatchObject({ element: 'fire', infusion: 'frost' });
    expect(paired.blowPower).toBeCloseTo(1 + 4 * k);
    expect(paired.finisherPower).toBeCloseTo(1 + 1 * k); // the frost staff's own 1
    // A secondary equal to the primary is unbound.
    expect(weapon({ pair: { primary: 'fire', secondary: 'fire' } }).infusion).toBeNull();
    // Unarmed, you punch with your primary.
    expect(
      computeHeroStats({}, registry, { pair: { primary: 'storm', secondary: 'nature' } }).weapon,
    ).toMatchObject({ baseId: null, element: 'storm', infusion: 'nature' });
    expect(computeHeroStats({}, registry).weapon).toMatchObject({ element: null, infusion: null });
  });
});
```

In `tests/delve-infusion.test.ts`, the `describe('the weapon infusion (display only)', …)` block: replace it whole (its second test, the staff's great orb, moves to `delve-pair.test.ts` in Task 7, where the finisher really discharges) with:

```ts
describe('the weapon infusion', () => {
  const staff = { weapon: gear('fire', 'weapon', 'staff') };

  it("is the pair's bound secondary; none without one, or when it equals the primary", () => {
    const pair = (secondary: ManaType | null) => ({ pair: { primary: 'fire' as const, secondary } });
    expect(computeHeroStats(staff, registry).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, pair('storm')).weapon.infusion).toBe('storm');
    expect(computeHeroStats(staff, registry, pair('fire')).weapon.infusion).toBeNull();
    expect(computeHeroStats(staff, registry, pair(null)).weapon.infusion).toBeNull();
  });
});
```

and in its imports, `import { computeHeroStats, type HeroStatsExtra } from '../src/delve/hero-stats.js';` becomes `import { computeHeroStats } from '../src/delve/hero-stats.js';`.

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts tests/delve-infusion.test.ts)`
Expected: FAIL (the filter is ignored: frost/nature counted; `blowPower` undefined; `weapon.infusion` null for the pair).

- [ ] **Step 3: The types**

In `src/types/delve.ts`, `HeroWeapon`: replace the `element` and `infusion` members (with their docs) by

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
```

and above `export interface DelveStats`, add:

```ts
/** The hero's two elements (`DelveProfile.pair`). */
export interface ManaPair {
  /** Null only before the "Choose your mana" screen. */
  primary: ManaType | null;
  /** The bound second element, or null until one is bound. */
  secondary: ManaType | null;
}
```

- [ ] **Step 4: `hero-stats.ts`**

Import: `import type { DelveBalance, HeroStats, HeroWeapon } from '../types/delve.js';` becomes `import type { DelveBalance, HeroStats, HeroWeapon, ManaPair } from '../types/delve.js';`.

After `isAttuneStat`, add:

```ts
/** The element an `*Attune` stat feeds, if it is one. */
export function attuneElement(stat: HeroStatKey): ManaType | undefined {
  return ATTUNE_STATS[stat];
}

/** The pair's elements: the primary, then a bound secondary that differs from it (none before the choice). */
export function pairElements(pair: ManaPair | undefined): ManaType[] {
  if (!pair?.primary) return [];
  return pair.secondary && pair.secondary !== pair.primary
    ? [pair.primary, pair.secondary]
    : [pair.primary];
}
```

After `itemAffinityAttunement`, add:

```ts
/** Attunement one item grants per element: its mana's base plus its `*Attune` lines (Prism aside). */
export function itemAttunement(registry: DataRegistry, item: GearItem): ManaMap {
  const att = emptyManaMap();
  att[item.mana] += itemAffinityAttunement(registry, item);
  for (const line of [...item.implicits, ...item.affixes]) {
    const mana = ATTUNE_STATS[line.stat];
    if (mana) att[mana] += Math.round(line.value);
  }
  return att;
}
```

In `HeroStatsExtra`, replace the `basicInfusion?: ManaType;` member (and its doc) with:

```ts
  /**
   * The hero's pair, for basic attacks: blows strike with the primary (even
   * unarmed) and the finisher discharges a bound secondary. A secondary equal
   * to the primary counts as unbound.
   */
  pair?: ManaPair;
  /** The two-element limit: with a pair primary, attunement counts only for the pair's elements. */
  filterAttunement?: boolean;
```

Replace the whole `computeAttunement` function with:

```ts
/** Total attunement per mana type from equipped gear (plus any `extra`); filtered to the pair on request. */
export function computeAttunement(
  equipped: EquippedGear,
  registry: DataRegistry,
  extra: HeroStatsExtra = {},
): ManaMap {
  const att = emptyManaMap();
  const pair = pairElements(extra.pair);
  const counts = (m: ManaType) => !extra.filterAttunement || pair.length === 0 || pair.includes(m);
  // Prism: the best of the gear's and the extra's, never both.
  let prism = Math.round(extra.legendaries?.prism ?? 0);
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (!item) continue;
    const a = itemAttunement(registry, item);
    for (const m of MANA_TYPES) att[m] += a[m];
    if (item.legendary?.id === 'prism') prism = Math.max(prism, Math.round(item.legendary.value));
  }
  for (const m of MANA_TYPES)
    att[m] = counts(m) ? att[m] + (extra.attunement?.[m] ?? 0) + prism : 0;
  return att;
}
```

In `computeHeroStats`, replace from `const attunement = computeAttunement(equipped, registry, extra);` through the end of the `const weapon: HeroWeapon = … ;` statement with:

```ts
  const attunement = computeAttunement(equipped, registry, extra);
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

- [ ] **Step 5: Exports**

In `src/index.ts`, the `./delve/hero-stats.js` export list: after `itemAffinityAttunement,` add `itemAttunement,`, `attuneElement,` and `pairElements,`.

- [ ] **Step 6: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS (no pair anywhere else yet, so every other test is unchanged), no type errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-infusion.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/delve/hero-stats.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-infusion.test.ts
git commit -m "feat(engine): the pair's basics and the two-element attunement limit in hero stats"
```

---

### Task 3: Power values the pair

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts` (`estimateCombat`, `compareItem`, `heroPower`)
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`, the hero-stats import becomes

```ts
import {
  compareItem,
  computeAttunement,
  computeHeroStats,
  estimateCombat,
  heroPower,
  type HeroStatsExtra,
} from '../src/delve/hero-stats.js';
import type { HeroWeapon, ManaPair } from '../src/types/delve.js';
```

and append:

```ts
describe('Power values the pair', () => {
  const weapon = gear('fire');
  const solo: ManaPair = { primary: 'fire', secondary: null };
  const bound: ManaPair = { primary: 'fire', secondary: 'storm' };

  it('estimateCombat reads blowPower for ordinary blows and finisherPower for the finisher', () => {
    const stats = computeHeroStats({ weapon }, registry, { pair: bound });
    const dps = (w: Partial<HeroWeapon>) =>
      estimateCombat({ ...stats, weapon: { ...stats.weapon, ...w } }, registry, 3).dps;
    const base = dps({});
    expect(dps({ blowPower: stats.weapon.blowPower * 2 })).toBeGreaterThan(base);
    expect(dps({ finisherPower: stats.weapon.finisherPower * 2 })).toBeGreaterThan(base);
  });

  it('rises with primary attunement, and with secondary attunement only once bound', () => {
    const power = (pair: ManaPair, ring?: GearItem) =>
      heroPower(ring ? { weapon, ring } : { weapon }, registry, 3, undefined, pair);
    expect(power(solo, item('fire'))).toBeGreaterThan(power(solo));
    expect(power(solo, item('storm'))).toBe(power(solo)); // unbound: no attunement, no gain
    expect(power(bound, item('storm'))).toBeGreaterThan(power(bound));
    expect(compareItem({ weapon }, item('storm'), registry, 3, undefined, solo).attunementDelta).toEqual(
      {},
    );
    expect(compareItem({ weapon }, item('storm'), registry, 3, undefined, bound).attunementDelta).toEqual(
      { storm: 1 },
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`estimateCombat` ignores `blowPower`/`finisherPower`, so the first test's DPS doesn't move; `heroPower`/`compareItem` ignore the extra `pair` argument, so the unbound storm ring still attunes).

- [ ] **Step 3: Implement**

In `estimateCombat`, delete the line `const weaponElem = stats.weapon.element ? stats.elementPower[stats.weapon.element] : 0;`, and replace

```ts
  let dps = (hit * (1 + weaponElem) * cleave * (stringPower / stringTime)) / stats.attackInterval;
```

with

```ts
  // Ordinary blows strike with the primary; the finisher discharges the secondary (or stays the primary).
  const w = stats.weapon;
  const elem = (m: ManaType | null) => (m ? stats.elementPower[m] : 0);
  const blow = w.blowPower * (1 + elem(w.element));
  const finisher = w.finisherPower * (1 + elem(w.infusion ?? w.element));
  const last = combo[combo.length - 1].power;
  const stringValue = (stringPower - last) * blow + last * finisher;
  let dps = (hit * cleave * (stringValue / stringTime)) / stats.attackInterval;
```

(Without a pair both multipliers are 1 and `infusion` is null, so this equals the old formula.)

Above `compareItem`, add (exported: `profileStats` in Task 4 reuses it):

```ts
/** The extra that applies a profile's pair: its basics and the two-element limit (none: no pair). */
export function pairExtra(pair?: ManaPair): HeroStatsExtra {
  return pair ? { pair, filterAttunement: true } : {};
}
```

`compareItem`: add a parameter after `builds?: AbilityBuilds,`:

```ts
  /** The hero's pair (its basics and the two-element limit); none counts every element. */
  pair?: ManaPair,
```

and its two `computeHeroStats(equipped, registry)` / `computeHeroStats(next, registry)` calls become `computeHeroStats(equipped, registry, pairExtra(pair))` / `computeHeroStats(next, registry, pairExtra(pair))`.

`heroPower`: add the same `pair?: ManaPair,` parameter after `builds?: AbilityBuilds,`, and its body becomes

```ts
  const stats = computeHeroStats(equipped, registry, pairExtra(pair));
  return estimateCombat(stats, registry, depth, builds).power;
```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS (the pacing test included: nothing passes a pair yet), no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): Power values blows by the primary and the finisher by the secondary"
```

---

### Task 4: Save version 4, the migration, and the one-element defaults

**Files:**
- Modify: `packages/engine/src/types/delve.ts` (`DelveProfile`)
- Modify: `packages/engine/src/delve/profile-schema.ts`
- Create: `packages/engine/src/delve/pair.ts`
- Modify: `packages/engine/src/delve/profile.ts` (`createDelveProfile`, `parseDelveProfile`)
- Modify: `packages/engine/src/arpg/abilities/resolve.ts` (`defaultAbilities`)
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/tests/delve-dive.test.ts`, `packages/engine/tests/delve-profile-abilities.test.ts`
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`, add these imports:

```ts
import { defaultAbilities } from '../src/arpg/abilities/resolve.js';
import { startDive } from '../src/delve/dive.js';
import { fixBuildsToPair } from '../src/delve/pair.js';
import { createDelveProfile, parseDelveProfile } from '../src/delve/profile.js';
import type { AbilityBuilds } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
```

(merge `DelveProfile` into the existing `../src/types/delve.js` type import) and append:

```ts
describe('save version 4', () => {
  /** A version 3 save of `p`: no pair, no Mana Dust. */
  function v3Of(p: DelveProfile) {
    const { pair: _pair, manaDust: _dust, ...rest } = p;
    return { ...rest, version: 3 };
  }
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

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
    expect(parseDelveProfile(registry, json(p))).toEqual({ profile: p, fixed: [] });
  });

  it('refuses a secondary without a primary, or equal to it', () => {
    const p = createDelveProfile(registry, 3);
    const bad = (pair: object) => parseDelveProfile(registry, json({ ...p, pair }));
    expect(bad({ primary: null, secondary: 'fire' })).toBeNull();
    expect(bad({ primary: 'fire', secondary: 'fire' })).toBeNull();
  });

  it('migrates version 3: the most attunement is the primary, and the builds are fixed to it', () => {
    const p = createDelveProfile(registry, 3); // a fire sword (1), an earth cuirass (1)
    const ring = { ...item('storm'), rarity: 'rare' as const }; // storm 2
    const old = {
      ...v3Of(p),
      equipped: { ...p.equipped, ring },
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
    ]);
  });

  it('ties go to the weapon, then MANA_TYPES order; nothing equipped leaves the choice open', () => {
    const p = createDelveProfile(registry, 3);
    expect(parseDelveProfile(registry, json(v3Of(p)))!.profile.pair.primary).toBe('fire');
    const { weapon: _weapon, ...noWeapon } = p.equipped;
    const tie = { ...v3Of(p), equipped: { ...noWeapon, ring: item('nature') } }; // earth 1, nature 1
    expect(parseDelveProfile(registry, json(tie))!.profile.pair.primary).toBe('earth');
    const bare = parseDelveProfile(registry, json({ ...v3Of(p), equipped: {} }))!;
    expect(bare.profile.pair.primary).toBeNull();
    expect(bare.fixed).toEqual([]);
  });

  it("migrates version 2 through version 3: its new primary's default builds, nothing to fix; a dive stays", () => {
    const p = startDive(registry, createDelveProfile(registry, 3), 1);
    const ring = { ...item('storm'), rarity: 'rare' as const }; // storm 2 beats the fire sword's 1
    const { abilities: _abilities, ...v2 } = v3Of({ ...p, equipped: { ...p.equipped, ring } });
    const res = parseDelveProfile(
      registry,
      json({ ...v2, version: 2, skillSlots: [null, null, null] }),
    )!;
    expect(res.profile).toMatchObject({ version: 4, pair: { primary: 'storm', secondary: null } });
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
    expect(res.fixed).toEqual([]);
    expect(res.profile.dive).toEqual(p.dive);
  });

  it('fixBuildsToPair keeps in-pair elements and gives an emptied slot the primary', () => {
    const abilities: AbilityBuilds = {
      primary: { form: 'lance', elements: ['storm', 'frost'], weight: 1, payment: 'cast' },
      defensive: { form: 'ward', elements: ['nature'], weight: -1, payment: 'charge' },
      ultimate: { form: 'nova', elements: ['fire'], weight: 0, payment: 'charge' },
    };
    const p: DelveProfile = {
      ...createDelveProfile(registry, 3),
      pair: { primary: 'fire', secondary: 'storm' },
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
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`../src/delve/pair.js` doesn't exist, so the file fails to load).

- [ ] **Step 3: The type and the schema**

`src/types/delve.ts`, `DelveProfile`: `version: 3;` becomes `version: 4;`, and after `abilities: AbilityBuilds;` add:

```ts
  /** The hero's two elements. */
  pair: ManaPair;
  /** From salvaging gear outside the pair; spent on Re-attune and Realign. */
  manaDust: number;
```

`src/delve/profile-schema.ts`: rename `export const DelveProfileSchema = z.object({` to `export const DelveProfileV3Schema = z.object({` and put this doc above it: `/** Version 3 (before the pair), kept frozen so older saves migrate through it. */`. Then replace the `DelveProfileV2Schema` definition (with its doc) by:

```ts
/** The hero's pair: a secondary only once there is a primary, and never the same element. */
const PairSchema = z
  .object({ primary: ManaTypeSchema.nullable(), secondary: ManaTypeSchema.nullable() })
  .refine(
    (p) => p.secondary === null || (p.primary !== null && p.secondary !== p.primary),
    'a secondary needs a different primary',
  );

export const DelveProfileSchema = DelveProfileV3Schema.extend({
  version: z.literal(4),
  pair: PairSchema,
  manaDust: z.number().int().min(0),
});

/** Version 2 saves had a spell bar instead of ability builds; they migrate through version 3. */
export const DelveProfileV2Schema = DelveProfileV3Schema.omit({
  version: true,
  abilities: true,
}).extend({
  version: z.literal(2),
  skillSlots: z.array(z.string().nullable()).length(3),
});
```

- [ ] **Step 4: `pair.ts` (what Task 4 needs)**

Create `src/delve/pair.ts`:

```ts
import type { DataRegistry } from '../data/registry.js';
import { ABILITY_SLOTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';
import type { DelveProfile, HeroStats } from '../types/delve.js';
import type { ManaType } from '../types/mana.js';
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';

/**
 * Elemental affinity: the hero's two elements (`profile.pair`). The primary is
 * chosen once; a second is bound between dives and can overtake the primary.
 * Every op but the choice waits for the dive to end. See the elemental affinity spec.
 * profile.ts and dive.ts import this module back: keep to function declarations.
 */

/** A build slot the pair changed: the elements it dropped and the build it has now. */
export interface BuildFix {
  slot: AbilitySlot;
  removed: ManaType[];
  build: AbilityBuild;
}

/** Whether `mana` is the primary or the bound secondary (always true before the choice). */
export function inPair(profile: Pick<DelveProfile, 'pair'>, mana: ManaType): boolean {
  return !profile.pair.primary || pairElements(profile.pair).includes(mana);
}

/** The hero's real stats: its gear, with the pair's basics and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): HeroStats {
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair));
}

/**
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
}
```

- [ ] **Step 5: `profile.ts` and `defaultAbilities`**

`src/arpg/abilities/resolve.ts`, `defaultAbilities`: its doc becomes `/** Builds for a new (or migrated) profile, all of \`element\`. */` and the defensive line becomes `defensive: { form: 'ward', elements: [element], weight: 0, payment: 'mana' },`.

`src/delve/profile.ts`:
- Imports: `import type { DelveProfile } from '../types/delve.js';` stays; `import type { GearItem, GearSlot, Rarity } from '../types/gear.js';` becomes `import type { EquippedGear, GearItem, GearSlot, Rarity } from '../types/gear.js';`; add `import { MANA_TYPES, type ManaType } from '../types/mana.js';`; `import { compareItem, heroPower } from './hero-stats.js';` becomes `import { compareItem, computeAttunement, heroPower } from './hero-stats.js';`; `import { DelveProfileSchema, DelveProfileV2Schema } from './profile-schema.js';` becomes `import { DelveProfileSchema, DelveProfileV2Schema, DelveProfileV3Schema } from './profile-schema.js';`; add `import { fixBuildsToPair, type BuildFix } from './pair.js';`.
- In `createDelveProfile`'s literal: `version: 3,` becomes `version: 4,`, and after `abilities: defaultAbilities(weapon.mana),` add `pair: { primary: null, secondary: null },` and `manaDust: 0,`.
- Replace the whole `parseDelveProfile` function (with its doc) by:

```ts
/** A save read back: the profile, and the build slots a migration changed (for a notice). */
export interface ParsedDelveProfile {
  profile: DelveProfile;
  fixed: BuildFix[];
}

/** Version 2 (spell bar): everything kept but the spells. It had no ability builds. */
function fromV2(raw: unknown) {
  const old = DelveProfileV2Schema.safeParse(raw);
  if (!old.success) return null;
  const { skillSlots: _spells, ...rest } = old.data;
  return rest;
}

/**
 * A migrated save's primary: the element with the most attunement from its
 * equipped gear (ties: the weapon's mana, then MANA_TYPES order), or null
 * with nothing equipped (the choice screen then shows).
 */
function migratedPrimary(registry: DataRegistry, equipped: EquippedGear): ManaType | null {
  const att = computeAttunement(equipped, registry);
  const top = Math.max(...MANA_TYPES.map((m) => att[m]));
  if (top <= 0) return null;
  const weapon = equipped.weapon?.mana;
  if (weapon && att[weapon] === top) return weapon;
  return MANA_TYPES.find((m) => att[m] === top)!;
}

/**
 * Validate an unknown JSON blob as a save, migrating older ones (2 → 3 → 4:
 * a primary from the gear, no secondary, no Mana Dust, builds fixed to the
 * pair; a dive in progress stays). Returns null when it doesn't fit.
 */
export function parseDelveProfile(registry: DataRegistry, raw: unknown): ParsedDelveProfile | null {
  const parsed = DelveProfileSchema.safeParse(raw);
  if (parsed.success) return { profile: parsed.data as DelveProfile, fixed: [] };
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
}
```

- [ ] **Step 6: Exports**

In `src/index.ts`: after the `export type { ProfileActionResult } from './delve/profile.js';` line, change it to `export type { ProfileActionResult, ParsedDelveProfile } from './delve/profile.js';`, and add below it:

```ts
export { inPair, profileStats, fixBuildsToPair } from './delve/pair.js';
export type { BuildFix } from './delve/pair.js';
```

- [ ] **Step 7: The existing tests**

`tests/delve-dive.test.ts`:
- `expect(p.version).toBe(3);` becomes `expect(p.version).toBe(4);`.
- The round-trip test's three `parseDelveProfile(…)` calls become:

```ts
    expect(parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))).toEqual({
      profile: p,
      fixed: [],
    });
    expect(parseDelveProfile(registry, { ...p, version: 1 })).toBeNull();
    expect(parseDelveProfile(registry, null)).toBeNull();
```

- In 'unequip moves the item into the bag…', `'Frost Ward',` becomes `'Fire Ward',` (the default Ward takes the weapon's element now).

`tests/delve-profile-abilities.test.ts`:
- The title `describe('profile abilities (save v3)', …)` becomes `describe('profile abilities (save v4)', …)`.
- `expect(p.version).toBe(3);` becomes `expect(p.version).toBe(4);`.
- `parseDelveProfile(JSON.parse(JSON.stringify(p)))?.abilities.primary.elements` becomes `parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.abilities.primary.elements`.
- In 'migrates a version 2 save…', `const p = parseDelveProfile(JSON.parse(JSON.stringify(v2)));` becomes `const p = parseDelveProfile(registry, JSON.parse(JSON.stringify(v2)))?.profile;`, `expect(p).not.toBeNull();` becomes `expect(p).toBeDefined();` (`?.profile` gives `undefined`, not `null`, for a bad save), and `expect(p!.version).toBe(3);` becomes `expect(p!.version).toBe(4);` (the frost weapon ties the earth cuirass and wins, so the primary is frost and the builds are frost's defaults).
- In 'remembers the new reactions', `parseDelveProfile(JSON.parse(JSON.stringify(p)))?.reactionsSeen` becomes `parseDelveProfile(registry, JSON.parse(JSON.stringify(p)))?.profile.reactionsSeen`.

- [ ] **Step 8: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS and no type errors, except possibly `tests/delve-pacing.test.ts`. The bot's default kit loses its Frost Ward (the Ward is fire now), so the assertion likeliest to go red is 'mana combos happen naturally' (`reactionsSeen ≥ 2`). No balance knob fixes that: Task 10's two-element Primary does. If pacing is red here, leave it until Task 11 and name the failing assertion in the commit body (e.g. `pacing: reactionsSeen < 2 until the autopilot binds (Task 10)`); the same holds for Tasks 5–9.

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/delve.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-profile-abilities.test.ts
git add packages/engine/src/types/delve.ts packages/engine/src/delve/profile-schema.ts packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/arpg/abilities/resolve.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts packages/engine/tests/delve-dive.test.ts packages/engine/tests/delve-profile-abilities.test.ts
git commit -m "feat(engine): save version 4 with the hero's pair, migrated from versions 2 and 3"
```

---

## Chunk 2: Engine: the pair ops, and real stats read the pair

### Task 5: The pair ops

**Files:**
- Modify: `packages/engine/src/delve/pair.ts`
- Modify: `packages/engine/src/delve/profile.ts` (`ProfileActionResult`, `replaceItem`, `createDelveProfile`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`, the pair import becomes

```ts
import {
  bindSecondary,
  chooseStartingMana,
  fixBuildsToPair,
  realign,
  reattuneItem,
  resolveOvertake,
} from '../src/delve/pair.js';
```

merge `GEAR_SLOTS` into the gear import (`import type { GearItem, GearSlot, HeroStatKey, Rarity } from '../src/types/gear.js';` becomes `import { GEAR_SLOTS, type GearItem, type GearSlot, type HeroStatKey, type Rarity } from '../src/types/gear.js';`), and append:

```ts
describe('the pair ops', () => {
  const fresh = () => createDelveProfile(registry, 3);
  /** A fire hero (sword and cuirass: fire 2) with storm bound. */
  const bound = (manaDust = 0, scrap = 0): DelveProfile => ({
    ...createDelveProfile(registry, 3, { primary: 'fire' }),
    pair: { primary: 'fire', secondary: 'storm' },
    manaDust,
    scrap,
  });

  it('chooseStartingMana: the primary, equipped gear re-attuned with its lines, default builds; once', () => {
    const p0 = fresh();
    const ring = item('earth', 'ring', [
      ['earthAttune', 2],
      ['stormAttune', 1],
      ['earthPower', 5],
    ]);
    const spare = item('earth', 'amulet');
    const res = chooseStartingMana(
      registry,
      { ...p0, equipped: { ...p0.equipped, ring }, bag: [spare] },
      'storm',
    );
    expect(res.ok).toBe(true);
    expect(res.profile.pair).toEqual({ primary: 'storm', secondary: null });
    expect(GEAR_SLOTS.flatMap((s) => res.profile.equipped[s]?.mana ?? [])).toEqual([
      'storm',
      'storm',
      'storm',
    ]);
    // Old-element lines convert; a new-element line already there swaps with them.
    expect(res.profile.equipped.ring!.affixes.map((l) => [l.stat, l.value])).toEqual([
      ['stormAttune', 2],
      ['earthAttune', 1],
      ['stormPower', 5],
    ]);
    expect(res.profile.bag).toEqual([spare]);
    expect(res.profile.abilities).toEqual(defaultAbilities('storm'));
    expect(chooseStartingMana(registry, res.profile, 'fire')).toMatchObject({
      ok: false,
      reason: 'Your mana is already chosen',
    });
    expect(createDelveProfile(registry, 3, { primary: 'storm' })).toEqual(
      chooseStartingMana(registry, fresh(), 'storm').profile,
    );
  });

  it('bindSecondary: free, once, never the primary, never mid-dive', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(bindSecondary(p, 'fire').ok).toBe(false);
    expect(bindSecondary(fresh(), 'storm').ok).toBe(false);
    expect(bindSecondary(startDive(registry, p, 1), 'storm').reason).toBe(
      'Bind a second element between dives',
    );
    const res = bindSecondary(p, 'storm');
    expect(res.profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(res.profile.scrap).toBe(p.scrap);
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
      },
    };
    const res = realign(registry, stormy, { secondary: 'nature' });
    expect(res.ok).toBe(true);
    expect(res.profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
    expect(res.profile.equipped).toEqual(rich.equipped);
    expect(res.profile.abilities.primary.elements).toEqual(['fire']);
    expect(res.fixed).toEqual([
      { slot: 'primary', removed: ['storm'], build: res.profile.abilities.primary },
    ]);
    expect(realign(registry, rich, { primary: 'storm', secondary: 'fire' }).ok).toBe(true);
    expect(realign(registry, rich, {}).reason).toBe('Nothing to change');
    expect(realign(registry, rich, { primary: 'storm' }).reason).toBe('Pick two different elements');
    const solo = createDelveProfile(registry, 3, { primary: 'fire' });
    expect(realign(registry, solo, { secondary: 'nature' }).reason).toBe(
      'Bind a second element first',
    );
    expect(
      realign(registry, bound(realignDust - 1, realignScrap), { secondary: 'nature' }).reason,
    ).toBe('Not enough Mana Dust');
    expect(
      realign(registry, bound(realignDust, realignScrap - 1), { secondary: 'nature' }).reason,
    ).toBe('Not enough scrap');
    expect(realign(registry, startDive(registry, rich, 1), { secondary: 'nature' }).reason).toBe(
      'Realign between dives',
    );
  });

  it('resolveOvertake: the secondary swaps in above 1.2 × the primary, never at 0 or mid-dive', () => {
    const p = bound();
    const slots = ['helm', 'gloves', 'boots'] as const;
    const wear = (n: number): DelveProfile => ({
      ...p,
      equipped: {
        ...p.equipped,
        ...Object.fromEntries(slots.slice(0, n).map((s) => [s, item('storm', s)])),
      },
    });
    expect(resolveOvertake(registry, wear(2)).swapped).toBe(false); // storm 2, fire 2 × 1.2
    const three = resolveOvertake(registry, wear(3)); // storm 3 > 2.4
    expect(three.swapped).toBe(true);
    expect(three.profile.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(resolveOvertake(registry, { ...p, equipped: {} }).swapped).toBe(false); // both 0
    expect(resolveOvertake(registry, startDive(registry, wear(3), 1)).swapped).toBe(false);
    const edge: DelveProfile = {
      ...p,
      equipped: {
        weapon: item('fire', 'weapon', [['fireAttune', 4]]), // fire 5
        ring: item('storm', 'ring', [['stormAttune', 5]]), // storm 6: equal to 1.2 × 5, not above
      },
    };
    expect(resolveOvertake(registry, edge).swapped).toBe(false);
  });

  it('reattuneItem: to the pair only, for Mana Dust, converting the old lines', () => {
    const cost = bal.pair.reattuneDust.rare;
    const helm: GearItem = {
      ...item('storm', 'helm', [
        ['stormPower', 8],
        ['firePower', 3],
      ]),
      uid: 'h',
      rarity: 'rare',
    };
    const p = { ...bound(cost), bag: [helm] };
    const res = reattuneItem(registry, p, 'h', 'fire');
    expect(res.ok).toBe(true);
    expect(res.item!.mana).toBe('fire');
    expect(res.item!.affixes.map((l) => [l.stat, l.value])).toEqual([
      ['firePower', 8],
      ['stormPower', 3],
    ]);
    expect(res.profile.bag).toEqual([res.item]);
    expect(res.profile.manaDust).toBe(0);
    expect(reattuneItem(registry, p, 'h', 'nature').reason).toBe(
      'Re-attune to one of your two elements',
    );
    expect(reattuneItem(registry, p, 'h', 'storm').reason).toBe('Already attuned to that element');
    expect(reattuneItem(registry, { ...p, manaDust: cost - 1 }, 'h', 'fire').reason).toBe(
      'Not enough Mana Dust',
    );
    expect(reattuneItem(registry, startDive(registry, p, 1), 'h', 'fire').reason).toBe(
      'Re-attune between dives',
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`chooseStartingMana` and the other ops are not exported from `pair.ts`).

- [ ] **Step 3: `profile.ts`**

- `ProfileActionResult`: after `item?: GearItem;` add

  ```ts
    /** Build slots the op changed to fit the pair (Realign). */
    fixed?: BuildFix[];
  ```

- `function replaceItem(` becomes `export function replaceItem(` (Re-attune uses it).
- `createDelveProfile`: its signature becomes

  ```ts
  /**
   * A new save. Without `primary` the hero has no pair yet (the Anvil asks);
   * the bot and tests pass one, which runs `chooseStartingMana`.
   */
  export function createDelveProfile(
    registry: DataRegistry,
    seed: number,
    opts: { primary?: ManaType } = {},
  ): DelveProfile {
  ```

  and the function's last lines (after the profile literal)

  ```ts
      dive: null,
    };
    return profile;
  }
  ```

  become

  ```ts
      dive: null,
    };
    return opts.primary ? chooseStartingMana(registry, profile, opts.primary).profile : profile;
  }
  ```
- The `./pair.js` import becomes `import { chooseStartingMana, fixBuildsToPair, type BuildFix } from './pair.js';`.

- [ ] **Step 4: `pair.ts`, whole**

Replace `src/delve/pair.ts` with:

```ts
import type { DataRegistry } from '../data/registry.js';
import { defaultAbilities } from '../arpg/abilities/resolve.js';
import { ABILITY_SLOTS, type AbilityBuild, type AbilitySlot } from '../types/ability.js';
import type { DelveProfile, HeroStats } from '../types/delve.js';
import { GEAR_SLOTS, type GearItem, type HeroStatKey, type StatRoll } from '../types/gear.js';
import type { ManaType } from '../types/mana.js';
import { isDiveActive } from './dive.js';
import { computeHeroStats, pairElements, pairExtra } from './hero-stats.js';
import { findItem, replaceItem, type ProfileActionResult } from './profile.js';

/**
 * Elemental affinity: the hero's two elements (`profile.pair`). The primary is
 * chosen once; a second is bound between dives and can overtake the primary.
 * Every op but the choice waits for the dive to end. See the elemental affinity spec.
 * profile.ts and dive.ts import this module back: keep to function declarations.
 */

/** A build slot the pair changed: the elements it dropped and the build it has now. */
export interface BuildFix {
  slot: AbilitySlot;
  removed: ManaType[];
  build: AbilityBuild;
}

function refuse(profile: DelveProfile, reason: string): ProfileActionResult {
  return { ok: false, profile, reason };
}

/** Whether `mana` is the primary or the bound secondary (always true before the choice). */
export function inPair(profile: Pick<DelveProfile, 'pair'>, mana: ManaType): boolean {
  return !profile.pair.primary || pairElements(profile.pair).includes(mana);
}

/** The hero's real stats: its gear, with the pair's basics and the two-element limit. */
export function profileStats(
  registry: DataRegistry,
  profile: Pick<DelveProfile, 'equipped' | 'pair'>,
): HeroStats {
  return computeHeroStats(profile.equipped, registry, pairExtra(profile.pair));
}

/**
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
}

/**
 * `item` attuned to `mana`: its lines of the old mana convert (`*Attune`,
 * `*Power`), and a line of the new element already there swaps with its
 * counterpart, so each stat keeps one line.
 */
function attuneTo(item: GearItem, mana: ManaType): GearItem {
  const lines = [...item.implicits, ...item.affixes];
  const swap = new Map<HeroStatKey, HeroStatKey>();
  for (const kind of ['Attune', 'Power'] as const) {
    const from = `${item.mana}${kind}` as HeroStatKey;
    const to = `${mana}${kind}` as HeroStatKey;
    if (lines.some((l) => l.stat === from)) swap.set(from, to).set(to, from);
  }
  const convert = (l: StatRoll): StatRoll => ({ ...l, stat: swap.get(l.stat) ?? l.stat });
  return {
    ...item,
    mana,
    implicits: item.implicits.map(convert),
    affixes: item.affixes.map(convert),
  };
}

/**
 * The one-time choice: `mana` becomes the primary, every equipped item is
 * re-attuned to it for free (the bag is left alone), and the builds start
 * over from `defaultAbilities(mana)`. Allowed mid-dive (a migrated save may be).
 */
export function chooseStartingMana(
  _registry: DataRegistry,
  profile: DelveProfile,
  mana: ManaType,
): ProfileActionResult {
  if (profile.pair.primary) return refuse(profile, 'Your mana is already chosen');
  const equipped = { ...profile.equipped };
  for (const slot of GEAR_SLOTS) {
    const item = equipped[slot];
    if (item && item.mana !== mana) equipped[slot] = attuneTo(item, mana);
  }
  return {
    ok: true,
    profile: {
      ...profile,
      equipped,
      pair: { primary: mana, secondary: null },
      abilities: defaultAbilities(mana),
    },
  };
}

/** Bind a second element: free, once, between dives. */
export function bindSecondary(profile: DelveProfile, mana: ManaType): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Bind a second element between dives');
  const { primary, secondary } = profile.pair;
  if (!primary) return refuse(profile, 'Choose your mana first');
  if (secondary) return refuse(profile, 'Your second element is already bound');
  if (mana === primary) return refuse(profile, 'That is already your primary');
  return { ok: true, profile: { ...profile, pair: { primary, secondary: mana } } };
}

/**
 * Change a bound pair (either element, or swap them) for Mana Dust and scrap,
 * between dives. Gear stays as it is; the builds follow the new pair.
 */
export function realign(
  registry: DataRegistry,
  profile: DelveProfile,
  next: { primary?: ManaType; secondary?: ManaType },
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Realign between dives');
  const { primary: p0, secondary: s0 } = profile.pair;
  if (!p0 || !s0) return refuse(profile, 'Bind a second element first');
  const primary = next.primary ?? p0;
  const secondary = next.secondary ?? s0;
  if (primary === secondary) return refuse(profile, 'Pick two different elements');
  if (primary === p0 && secondary === s0) return refuse(profile, 'Nothing to change');
  const cost = registry.getDelveBalance().pair;
  if (profile.manaDust < cost.realignDust) return refuse(profile, 'Not enough Mana Dust');
  if (profile.scrap < cost.realignScrap) return refuse(profile, 'Not enough scrap');
  const res = fixBuildsToPair({
    ...profile,
    pair: { primary, secondary },
    manaDust: profile.manaDust - cost.realignDust,
    scrap: profile.scrap - cost.realignScrap,
  });
  return { ok: true, profile: res.profile, fixed: res.fixed };
}

/**
 * Between dives, a bound secondary with more attunement than the primary
 * (above 0 and above `overtakeMargin` × it) takes its place, and the old
 * primary becomes the secondary. Builds stay valid: the pair is the same two.
 */
export function resolveOvertake(
  registry: DataRegistry,
  profile: DelveProfile,
): { profile: DelveProfile; swapped: boolean } {
  const { primary, secondary } = profile.pair;
  if (!primary || !secondary || isDiveActive(profile)) return { profile, swapped: false };
  const att = profileStats(registry, profile).attunement;
  const margin = registry.getDelveBalance().pair.overtakeMargin;
  if (att[secondary] <= 0 || att[secondary] <= margin * att[primary])
    return { profile, swapped: false };
  return {
    profile: { ...profile, pair: { primary: secondary, secondary: primary } },
    swapped: true,
  };
}

/** Re-attune an item to the pair's other element for Mana Dust, between dives. */
export function reattuneItem(
  registry: DataRegistry,
  profile: DelveProfile,
  uid: string,
  mana: ManaType,
): ProfileActionResult {
  if (isDiveActive(profile)) return refuse(profile, 'Re-attune between dives');
  const found = findItem(profile, uid);
  if (!found) return refuse(profile, 'Item not found');
  if (!pairElements(profile.pair).includes(mana))
    return refuse(profile, 'Re-attune to one of your two elements');
  if (found.item.mana === mana) return refuse(profile, 'Already attuned to that element');
  const cost = registry.getDelveBalance().pair.reattuneDust[found.item.rarity];
  if (profile.manaDust < cost) return refuse(profile, 'Not enough Mana Dust');
  const item = attuneTo(found.item, mana);
  return {
    ok: true,
    item,
    profile: { ...replaceItem(profile, item), manaDust: profile.manaDust - cost },
  };
}
```

- [ ] **Step 5: Exports**

In `src/index.ts`, the pair export becomes:

```ts
export {
  inPair,
  profileStats,
  fixBuildsToPair,
  chooseStartingMana,
  bindSecondary,
  realign,
  resolveOvertake,
  reattuneItem,
} from './delve/pair.js';
```

- [ ] **Step 6: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS but possibly the pacing test (see Task 4 Step 8), no type errors.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): choose, bind, realign, overtake and re-attune the pair"
```

---

### Task 6: Real stats read the pair: Power, Equip best, salvage candidates, the floor, `setAbility`

**Files:**
- Modify: `packages/engine/src/delve/profile.ts` (`profilePower`, `equipBest`, `salvageCandidates`, `setAbility`)
- Modify: `packages/engine/src/delve/dive.ts` (`beginFloor`, `heroMaxHp`)
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`: the dive import becomes `import { beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';`; the profile import becomes `import { createDelveProfile, equipBest, parseDelveProfile, profilePower, salvageCandidates, setAbility } from '../src/delve/profile.js';`; add `profileStats` to the pair import; add `AbilityBuild` to the `../src/types/ability.js` type import. Append:

```ts
describe('real stats read the pair', () => {
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
  });

  it('Power, Equip best, salvage, the floor and max life ignore attunement outside the pair', () => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    // No stats, only earth 10 (1 + 9): unfiltered, that's the earth mastery (×1.2 max life).
    const ring = item('earth', 'ring', [['earthAttune', 9]]);
    const worn = { ...p, equipped: { ...p.equipped, ring } };
    expect(profilePower(registry, worn)).toBe(profilePower(registry, p));
    expect(equipBest(registry, { ...p, bag: [ring] }).equipped).toEqual([]);
    expect(salvageCandidates(registry, { ...p, bag: [ring] }, 'common')).toEqual([ring.uid]);
    const floor = beginFloor(registry, startDive(registry, worn, 1));
    expect(floor.hero.stats.attunement.earth).toBe(0);
    expect(heroMaxHp(registry, worn)).toBe(profileStats(registry, worn).maxHp);
    expect(heroMaxHp(registry, worn)).toBeLessThan(computeHeroStats(worn.equipped, registry).maxHp);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`setAbility` accepts nature; unfiltered, the earth ring (earth 10, the earth mastery) is taken by Equip best, left off the salvage list, attuned on the floor and counted in `heroMaxHp`; Power likely differs too).

- [ ] **Step 3: `profile.ts`**

- The `./pair.js` import becomes `import { chooseStartingMana, fixBuildsToPair, inPair, type BuildFix } from './pair.js';`.
- `setAbility`: after the `if (!els.every((e) => e in registry.getArpgData().mana)) throw new Error('Unknown element');` line, add

  ```ts
    if (!els.every((e) => inPair(profile, e))) throw new Error('Pick from your two elements');
  ```

  and its doc gains `, or (once there is a pair) an element outside it` after `one or two distinct elements`.
- `profilePower`: `return heroPower(profile.equipped, registry, referenceDepth(profile), profile.abilities);` becomes `return heroPower(profile.equipped, registry, referenceDepth(profile), profile.abilities, profile.pair);`.
- `salvageCandidates`: `compareItem(profile.equipped, item, registry, depth).powerPct <= 0,` becomes `compareItem(profile.equipped, item, registry, depth, undefined, profile.pair).powerPct <= 0,`.
- `equipBest`: `let bestPower = heroPower(current.equipped, registry, depth);` becomes `let bestPower = heroPower(current.equipped, registry, depth, undefined, current.pair);` and `const power = heroPower({ ...current.equipped, [slot]: item }, registry, depth);` becomes `const power = heroPower({ ...current.equipped, [slot]: item }, registry, depth, undefined, current.pair);`.

- [ ] **Step 4: `dive.ts`**

- `import { computeHeroStats } from './hero-stats.js';` becomes `import { profileStats } from './pair.js';`.
- `beginFloor`: `const stats = computeHeroStats(profile.equipped, registry);` becomes `const stats = profileStats(registry, profile);`.
- `heroMaxHp`: `return computeHeroStats(profile.equipped, registry).maxHp;` becomes `return profileStats(registry, profile).maxHp;`.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS but possibly the pacing test (see Task 4 Step 8), no type errors.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/profile.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): Power, Equip best, the floor and ability builds keep to the pair"
```

---

## Chunk 3: Engine: basics, loot, Mana Dust, the autopilot and the pacing gate

### Task 7: The finisher discharges the secondary

**Files:**
- Modify: `packages/engine/src/arpg/basic.ts` (`BASIC_STATUS`, `strike`, `burstShot`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`: add `import type { ArpgEvent, ArpgWorld, MonsterEntity } from '../src/types/arpg.js';`, add `type EquippedGear` to the `../src/types/gear.js` import, and the fixtures import becomes `import { STEP, arena, bal, dummy, gear, registry, run } from './fixtures/arena.js';`. Below the `item` helper add:

```ts
type Of<K extends ArpgEvent['kind']> = Extract<ArpgEvent, { kind: K }>;
function only<K extends ArpgEvent['kind']>(events: ArpgEvent[], kind: K): Of<K>[] {
  return events.filter((e): e is Of<K> => e.kind === kind);
}
```

and append:

```ts
describe('basic attacks with a pair', () => {
  const sword = { weapon: gear('fire') }; // reach 1.9
  const staff = { weapon: gear('fire', 'weapon', 'staff') };
  const FIRE_STORM: HeroStatsExtra = { pair: { primary: 'fire', secondary: 'storm' } };
  const k = bal.pair.basicPowerPerAttune;

  /** One sturdy foe (in a sword's reach by default), the hero on `extra`; `finisher` starts on the string's last blow. */
  function strikeWorld(
    equipped: EquippedGear,
    extra: HeroStatsExtra,
    finisher = false,
    foe: Partial<MonsterEntity> = dummy(13, 34.5),
  ): ArpgWorld {
    const w = arena([foe], { equipped });
    w.hero.stats = computeHeroStats(equipped, registry, extra);
    if (finisher) {
      w.hero.attackCount = w.hero.stats.weapon.combo.length - 1;
      w.hero.lastBasicAt = 0;
    }
    return w;
  }

  /** Step until the first blow lands (its `basic` event), returning every event. */
  function firstBlow(w: ArpgWorld): ArpgEvent[] {
    const events: ArpgEvent[] = [];
    for (let i = 0; i < 300 && !events.some((e) => e.kind === 'basic'); i++)
      events.push(...run(w, STEP));
    return events;
  }

  it('blows strike with the primary; the finisher with the secondary, always applying its status', () => {
    const blow = firstBlow(strikeWorld(sword, FIRE_STORM));
    expect(only(blow, 'basic')[0]).toMatchObject({ element: 'fire', finisher: false });
    expect(only(blow, 'hit').map((h) => h.element)).toEqual(['fire']);
    const w = strikeWorld(sword, FIRE_STORM, true);
    const fin = firstBlow(w);
    expect(only(fin, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
    expect(only(fin, 'hit').map((h) => h.element)).toEqual(['storm']);
    expect(w.monsters[0].status.shockUntil).toBeGreaterThan(w.t); // no 30% roll: always
  });

  it('fire blows, then a storm finisher on a burning foe: Overload', () => {
    const w = strikeWorld(sword, FIRE_STORM, true);
    w.monsters[0].status.burnUntil = 1e9;
    expect(only(firstBlow(w), 'reaction').map((e) => e.reaction)).toContain('overload');
  });

  it("Twin Fang's extra hit follows the finisher's element", () => {
    const w = strikeWorld(sword, { ...FIRE_STORM, legendaries: { twin_fang: 100 } }, true);
    const hits = only(firstBlow(w), 'hit').filter((h) => h.source === 'basic');
    expect(hits.map((h) => h.element)).toEqual(['storm', 'storm']);
  });

  it("a ranged finisher's shot carries the secondary, and its great-orb burst no infusion", () => {
    const w = strikeWorld(staff, FIRE_STORM, true, dummy(13, 30));
    const events = firstBlow(w);
    expect(only(events, 'basic')[0]).toMatchObject({ element: 'storm', finisher: true });
    w.hero.nextAttackAt = 1e9; // just this shot
    events.push(...run(w, 1));
    const bursts = only(events, 'explode');
    expect(bursts.length).toBeGreaterThan(0);
    for (const e of bursts) expect(e).toMatchObject({ element: 'storm', infusion: null });
    const hits = only(events, 'hit').filter((h) => h.source === 'basic');
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.element).toBe('storm');
  });

  it('unarmed punches with the primary; without a secondary the finisher stays the primary', () => {
    const punch = firstBlow(strikeWorld({}, { pair: { primary: 'frost', secondary: null } }));
    expect(only(punch, 'hit')[0].element).toBe('frost');
    const solo = strikeWorld(sword, { pair: { primary: 'fire', secondary: null } }, true);
    expect(only(firstBlow(solo), 'basic')[0]).toMatchObject({ element: 'fire', finisher: true });
  });

  it('attunement powers each: blows by the primary, the finisher by the secondary', () => {
    const amount = (extra: HeroStatsExtra, finisher: boolean) =>
      only(firstBlow(strikeWorld(sword, extra, finisher)), 'hit')[0].amount;
    const blow = amount(FIRE_STORM, false); // the sword's own fire 1
    expect(amount({ ...FIRE_STORM, attunement: { fire: 5 } }, false) / blow).toBeCloseTo(
      (1 + 6 * k) / (1 + k),
    );
    expect(amount({ ...FIRE_STORM, attunement: { storm: 5 } }, false)).toBe(blow);
    const finisher = amount(FIRE_STORM, true); // storm 0
    expect(amount({ ...FIRE_STORM, attunement: { storm: 5 } }, true) / finisher).toBeCloseTo(
      1 + 5 * k,
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (the finisher still strikes with fire; the burst carries `infusion: 'storm'`; attunement doesn't scale blows).

- [ ] **Step 3: Implement**

In `src/arpg/basic.ts`:

`const BASIC_STATUS: Record<ManaType, StatusId> = {` becomes

```ts
/** The status each element's basic blows may apply (a finisher's discharge always applies it). */
export const BASIC_STATUS: Record<ManaType, StatusId> = {
```

In `strike`, replace from `const surge = surging(ctx);` through the `if (element) { … }` block (the status roll) with:

```ts
  const surge = surging(ctx);
  // The finisher discharges a bound secondary (weapon.infusion); every other blow strikes
  // with the primary. Each grows with its element's attunement (blowPower / finisherPower).
  const discharge = last && w.infusion !== null;
  const element: ManaType | null = discharge ? w.infusion : w.element;
  const unit =
    h.stats.weaponDamage * h.stats.damageMult * (last ? w.finisherPower : w.blowPower);
  const base = unit * s.power;
  const twinPct = (h.stats.legendaries.twin_fang ?? 0) / 100;
  const twin = twinPct > 0 && last;
  const applies: StatusId[] = surge ? [...surge.knobs.applies] : [];
  if (discharge && element) {
    // A discharge always applies the secondary's status (immunities still hold).
    if (!applies.includes(BASIC_STATUS[element])) applies.push(BASIC_STATUS[element]);
  } else if (element) {
    const chance = element === 'earth' ? BASIC_STATUS_CHANCE * 0.6 : BASIC_STATUS_CHANCE;
    const status = BASIC_STATUS[element];
    if (!applies.includes(status) && world.rng.next() < chance) applies.push(status);
  }
```

(Twin Fang's hits already use `unit` and `element`, so they follow the finisher's element and power. Without a pair primary both multipliers are 1 and `infusion` is null: every blow is exactly as before.)

In `burstShot`, the explode event's `infusion: ctx.world.hero.stats.weapon.infusion,` becomes

```ts
    // The motif only when the body isn't already that element (a finisher's discharge).
    infusion: p.element === ctx.world.hero.stats.weapon.infusion ? null : ctx.world.hero.stats.weapon.infusion,
```

In `src/index.ts`, `export { basicStep } from './arpg/basic.js';` becomes `export { basicStep, BASIC_STATUS } from './arpg/basic.js';`.

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS (every other basics test has no pair, so it is unchanged; the pacing test as in Task 4 Step 8), no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/arpg/basic.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/arpg/basic.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): basic blows strike with the primary; the finisher discharges the secondary"
```

---

### Task 8: Drops lean toward the pair

**Files:**
- Modify: `packages/engine/src/types/arpg.ts` (`LootContext`)
- Modify: `packages/engine/src/loot/item-generator.ts` (`ItemGenOptions`, `rollMana`, `generateItem`)
- Modify: `packages/engine/src/loot/drops.ts` (`DropContext`, `rollEncounterDrops`)
- Modify: `packages/engine/src/arpg/combat.ts` (`dropLoot`), `packages/engine/src/arpg/sandbox.ts` (`createSandboxWorld`), `packages/engine/src/delve/dive.ts` (`beginFloor`)
- Modify: `packages/engine/tests/fixtures/arena.ts`, `packages/engine/tests/arpg-sim.test.ts`, `packages/engine/tests/delve-loot.test.ts` (their loot and drop-context literals)
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts` add the imports

```ts
import { generateItem } from '../src/loot/item-generator.js';
import { rollEncounterDrops } from '../src/loot/drops.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
```

and append:

```ts
describe('drops lean toward the pair', () => {
  // Elite drops at depth 5 in a fire biome, seeds 0–7, recorded before the pair existed.
  const GOLDEN = [
    'fire:common:helm,frost:common:wand',
    'fire:common:ring,fire:common:helm',
    'frost:uncommon:bow,fire:rare:gauntlets,fire:magic:greaves',
    'fire:uncommon:amulet,storm:common:gauntlets',
    'fire:common:helm,shadow:magic:axe',
    'fire:common:ring,fire:uncommon:amulet',
    'frost:magic:cuirass,fire:common:gauntlets,earth:magic:helm',
    'earth:rare:gauntlets,storm:magic:greaves',
  ];

  it('with an empty pair, the seeded drop streams are unchanged', () => {
    const ctx = {
      depth: 5,
      kind: 'elite' as const,
      magicFind: 0,
      pity: 0,
      dropMult: 1,
      legendaryBoost: 1,
      forceLegendary: false,
      nextUid: 1,
      biomeMana: 'fire' as const,
      pair: [],
    };
    const got = GOLDEN.map((_, s) =>
      rollEncounterDrops(registry, ctx, new SeededRNG(s))
        .items.map((i) => `${i.mana}:${i.rarity}:${i.baseId}`)
        .join(','),
    );
    expect(got).toEqual(GOLDEN);
  });

  it.each([
    ['frost', 0],
    ['fire', 1],
  ] as const)('with a pair in a %s biome, the in-pair rate matches the formula', (biome, inside) => {
    const pair: ManaType[] = ['fire', 'storm'];
    const { dropBias } = bal.pair;
    const bias = bal.loot.biomeManaBias;
    const expected = dropBias + (1 - dropBias) * (bias * inside + ((1 - bias) * pair.length) / 6);
    const N = 4000;
    let hits = 0;
    for (let i = 0; i < N; i++) {
      const opts = { uid: 'p', ilvl: 3, rarity: 'common' as const, biomeMana: biome, pair };
      if (pair.includes(generateItem(registry, opts, new SeededRNG(i)).mana)) hits++;
    }
    expect(Math.abs(hits / N - expected)).toBeLessThan(0.03);
  });

  it("the floor's loot context carries the pair, primary first", () => {
    const p = bindSecondary(createDelveProfile(registry, 3, { primary: 'frost' }), 'nature').profile;
    expect(beginFloor(registry, startDive(registry, p, 1)).loot.pair).toEqual(['frost', 'nature']);
    expect(beginFloor(registry, startDive(registry, createDelveProfile(registry, 3), 1)).loot.pair).toEqual(
      [],
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (the golden check already passes; the rates are the plain biome rates, about 0.18 in the frost biome and 0.63 in the fire one; the floor has no `loot.pair`).

- [ ] **Step 3: Implement**

`src/types/arpg.ts`, `LootContext`: after `forceLegendary: boolean;` add

```ts
  /** The hero's pair, primary first (empty before the choice): drops lean toward it. */
  pair: ManaType[];
```

`src/loot/item-generator.ts`:
- `ItemGenOptions`: after `biomeMana?: ManaType;` add

  ```ts
    /** The hero's pair, primary first: drops lean toward it. Empty or absent: no lean. */
    pair?: readonly ManaType[];
  ```

- Replace `rollMana` (with its doc) by:

  ```ts
  /**
   * Pick a mana affinity. With a pair, `pair.dropBias` of drops take one of its
   * elements (the primary `primaryShare` of the time once two are bound); the
   * rest lean toward the biome's element, else roll uniformly. An empty pair
   * draws exactly as before (no extra random draw).
   */
  export function rollMana(
    registry: DataRegistry,
    biomeMana: ManaType | undefined,
    rng: SeededRNG,
    pair: readonly ManaType[] = [],
  ): ManaType {
    const bal = registry.getDelveBalance();
    if (pair.length > 0 && rng.next() < bal.pair.dropBias)
      return pair.length > 1 && rng.next() >= bal.pair.primaryShare ? pair[1] : pair[0];
    if (biomeMana && rng.next() < bal.loot.biomeManaBias) return biomeMana;
    return MANA_TYPES[rng.nextInt(0, MANA_TYPES.length - 1)];
  }
  ```

- `generateItem`: `const mana = opts.mana ?? rollMana(registry, opts.biomeMana, rng);` becomes `const mana = opts.mana ?? rollMana(registry, opts.biomeMana, rng, opts.pair);`.

`src/loot/drops.ts`:
- `DropContext`: after `biomeMana?: ManaType;` add

  ```ts
    /** The hero's pair, primary first (empty before the choice): item affinities lean toward it. */
    pair: ManaType[];
  ```

- `rollEncounterDrops`: `{ uid: \`g${nextUid++}\`, ilvl, rarity, biomeMana: ctx.biomeMana }` becomes `{ uid: \`g${nextUid++}\`, ilvl, rarity, biomeMana: ctx.biomeMana, pair: ctx.pair }`.

`src/arpg/combat.ts`, `dropLoot`: after `biomeMana: world.element,` add `pair: loot.pair,`.

`src/arpg/sandbox.ts`, `createSandboxWorld`'s `loot`: after `forceLegendary: false,` add `pair: [],`.

`src/delve/dive.ts`: add `import { pairElements } from './hero-stats.js';`, and in `beginFloor`'s `loot`, after `forceLegendary: !profile.firstBossLegendaryGiven,` add `pair: pairElements(profile.pair),`.

`tests/fixtures/arena.ts` and `tests/arpg-sim.test.ts`'s `world()`: in each `loot: { … }` literal, after `forceLegendary: false,` add `pair: [],`. Two more literals (Vitest doesn't type-check tests, so they'd run without it, but keep the fixtures honest):
- `tests/arpg-sim.test.ts`, 're-entering a floor…': `const loot = { pity: 0, magicFind: 0, legendaryBoost: 1, dropMult: 1, forceLegendary: false };` becomes `const loot = { pity: 0, magicFind: 0, legendaryBoost: 1, dropMult: 1, forceLegendary: false, pair: [] };`.
- `tests/delve-loot.test.ts`, `describe('rollEncounterDrops')`'s `base`: after `nextUid: 1,` add `pair: [],` (by hand: this file isn't Prettier-clean).

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS (the golden streams hold; the pacing test as in Task 4 Step 8), no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/types/arpg.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/types/arpg.ts packages/engine/src/loot/item-generator.ts packages/engine/src/loot/drops.ts packages/engine/src/arpg/combat.ts packages/engine/src/arpg/sandbox.ts packages/engine/src/delve/dive.ts packages/engine/tests/fixtures/arena.ts packages/engine/tests/arpg-sim.test.ts packages/engine/tests/delve-loot.test.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): drops lean toward the hero's pair"
```

---

### Task 9: Mana Dust from every salvage

**Files:**
- Modify: `packages/engine/src/delve/pair.ts` (`salvageDust`)
- Modify: `packages/engine/src/delve/profile.ts` (`BagInsertResult`, `addLootToBag`, `salvageItems`)
- Modify: `packages/engine/src/delve/dive.ts` (`BankResult`, `bankWorld`)
- Modify: `packages/engine/src/index.ts`
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts`: add `salvageDust` to the pair import; the dive import becomes `import { bankWorld, beginFloor, heroMaxHp, startDive } from '../src/delve/dive.js';`; add `salvageItems` and `setAutoSalvage` to the profile import. Append:

```ts
describe('Mana Dust from salvage', () => {
  const dust = bal.pair.salvageDust;
  const magic = (mana: ManaType, uid: string): GearItem => ({
    ...item(mana, 'helm'),
    uid,
    rarity: 'magic',
  });
  const fire = () => createDelveProfile(registry, 3, { primary: 'fire' });

  it('salvageDust: gear outside the pair only, and none before the choice', () => {
    expect(salvageDust(registry, magic('frost', 'a'), { primary: 'fire', secondary: null })).toBe(
      dust.magic,
    );
    expect(salvageDust(registry, magic('fire', 'a'), { primary: 'fire', secondary: null })).toBe(0);
    expect(salvageDust(registry, magic('frost', 'a'), { primary: null, secondary: null })).toBe(0);
  });

  it('salvageItems adds it', () => {
    const p = { ...fire(), bag: [magic('frost', 'a'), magic('fire', 'b')] };
    const res = salvageItems(registry, p, ['a', 'b']);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(dust.magic);
  });

  it('auto-salvage and a full bag add it, and banking reports it', () => {
    const p = startDive(registry, setAutoSalvage(fire(), 'magic', true), 1);
    const w = beginFloor(registry, p);
    w.pending.items = [magic('frost', 'a'), magic('fire', 'b')];
    const res = bankWorld(registry, p, w);
    expect(res.dust).toBe(dust.magic);
    expect(res.profile.manaDust).toBe(dust.magic);

    const bag = Array.from({ length: bal.loot.bagSize }, (_, i) => magic('fire', `f${i}`));
    const full = { ...startDive(registry, fire(), 1), bag };
    const w2 = beginFloor(registry, full);
    w2.pending.items = [{ ...magic('frost', 'r'), rarity: 'rare' }];
    expect(bankWorld(registry, full, w2)).toMatchObject({ bagFull: true, dust: dust.rare });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`salvageDust` is not exported; `res.dust` is undefined).

- [ ] **Step 3: Implement**

`src/delve/pair.ts`: the types import becomes `import type { DelveProfile, HeroStats, ManaPair } from '../types/delve.js';`, and after `profileStats` add:

```ts
/** Mana Dust from salvaging `item`: its rarity's share when its mana is outside the pair (none before the choice). */
export function salvageDust(registry: DataRegistry, item: GearItem, pair: ManaPair): number {
  return inPair({ pair }, item.mana) ? 0 : registry.getDelveBalance().pair.salvageDust[item.rarity];
}
```

`src/delve/profile.ts`:
- The `./pair.js` import gains `salvageDust`.
- `BagInsertResult`: after `scrap: number;` add `/** Mana Dust from the melted items outside the pair. */` and `dust: number;`.
- `addLootToBag`: after `let scrap = 0;` add `let dust = 0;`; after `scrap += salvageValue(registry, item);` add `dust += salvageDust(registry, item, profile.pair);`; in the returned profile, after `scrap: recorded.profile.scrap + scrap,` add `manaDust: recorded.profile.manaDust + dust,`; and after the result's `scrap,` add `dust,`.
- `salvageItems`: its return type `{ profile: DelveProfile; scrap: number; count: number }` becomes `{ profile: DelveProfile; scrap: number; dust: number; count: number }`, its doc gains ` Gear outside the pair also gives Mana Dust.`; after `let scrap = 0;` add `let dust = 0;`; after `scrap += salvageValue(registry, item);` add `dust += salvageDust(registry, item, profile.pair);`; in the returned profile, after `scrap: profile.scrap + scrap,` add `manaDust: profile.manaDust + dust,`; and after the result's `scrap,` add `dust,`.

`src/delve/dive.ts`:
- `BankResult`: after `scrap: number;` add `/** Mana Dust from items melted by auto-salvage or a full bag. */` and `dust: number;`.
- `bankWorld`'s returned object: after `scrap: scrap + bagged.scrap,` add `dust: bagged.dust,`.

`src/index.ts`: add `salvageDust,` to the `./delve/pair.js` export list.

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all PASS (the pacing test as in Task 4 Step 8), no type errors.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/pair.ts packages/engine/src/delve/profile.ts packages/engine/src/delve/dive.ts packages/engine/src/index.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): salvaging gear outside the pair gives Mana Dust"
```

---

### Task 10: The autopilot binds, builds from both, and overtakes

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts`
- Test: `packages/engine/tests/delve-pair.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/delve-pair.test.ts` add `import { betweenDives, runAutopilot } from '../src/delve/autopilot.js';` and `import { pairElements } from '../src/delve/hero-stats.js';` (merge it into the hero-stats import), and append:

```ts
describe('the autopilot and the pair', () => {
  /** Storm gear worse than the starter sword (no damage line): junk, salvaged between dives. */
  const junk = (uid: string): GearItem => ({ ...item('storm', 'weapon'), uid, baseId: 'sword' });

  it('binds the element it owns most before salvaging, and builds its Primary from both', () => {
    const p = { ...createDelveProfile(registry, 5, { primary: 'fire' }), bag: [junk('j1'), junk('j2')] };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(after.bag.map((i) => i.uid)).not.toContain('j1'); // melted…
    expect(after.manaDust).toBe(0); // …after the bind: storm was in the pair by then
    expect(after.abilities.primary.elements).toEqual(['fire', 'storm']);
  });

  it('skips the bind while it owns nothing of another element', () => {
    const after = betweenDives(registry, createDelveProfile(registry, 5, { primary: 'fire' }));
    expect(after.pair.secondary).toBeNull();
  });

  it('lets an overtaking secondary swap in, and rebuilds its Primary to match', () => {
    const p0 = createDelveProfile(registry, 5, { primary: 'fire' }); // fire 2
    const p: DelveProfile = {
      ...p0,
      pair: { primary: 'fire', secondary: 'storm' },
      equipped: {
        ...p0.equipped,
        helm: item('storm', 'helm'),
        gloves: item('storm', 'gloves'),
        boots: item('storm', 'boots'),
      }, // storm 3 > 2.4
    };
    const after = betweenDives(registry, p);
    expect(after.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(after.abilities.primary.elements).toEqual(['storm', 'fire']);
  });

  it('starts from the primary it is given', () => {
    const { profile } = runAutopilot(registry, { seed: 1, dives: 1, primary: 'frost' });
    expect(pairElements(profile.pair)).toContain('frost');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts)`
Expected: FAIL (`betweenDives` is not exported; `runAutopilot` ignores `primary`).

- [ ] **Step 3: Implement**

In `src/delve/autopilot.ts`:
- Imports: `import { GEAR_SLOTS } from '../types/gear.js';` stays; add `import { MANA_TYPES, emptyManaMap, type ManaType } from '../types/mana.js';`; `import { compareItem, computeHeroStats } from './hero-stats.js';` becomes `import { compareItem, itemAttunement } from './hero-stats.js';`; add `import { bindSecondary, fixBuildsToPair, profileStats, resolveOvertake } from './pair.js';`; the `./profile.js` import gains `setAbility`.
- `AutopilotOptions`: after `profile?: DelveProfile;` add

  ```ts
    /** A fresh profile's starting mana (default fire). */
    primary?: ManaType;
  ```

- `playFloor`: `refreshWorldHero(registry, world, computeHeroStats(p.equipped, registry), p.abilities);` becomes `refreshWorldHero(registry, world, profileStats(registry, p), p.abilities);`.
- `visitForge`: `(i) => i.rarity === rarity && !i.locked && compareItem(p.equipped, i, registry, depth).powerPct <= 0,` becomes `(i) => i.rarity === rarity && !i.locked && compareItem(p.equipped, i, registry, depth, undefined, p.pair).powerPct <= 0,`.
- Above `visitForge`, add:

  ```ts
  /**
   * Bind the non-primary element the bot owns the most attunement in (equipped
   * and bagged: each item's base plus its `*Attune` lines; ties in MANA_TYPES
   * order), none while that's all 0; then build the Primary from both elements,
   * so it keeps finding reactions.
   */
  function bindBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
    const primary = profile.pair.primary;
    if (!primary) return profile;
    let p = profile;
    if (!p.pair.secondary) {
      const owned = emptyManaMap();
      for (const item of [...GEAR_SLOTS.map((s) => p.equipped[s]), ...p.bag]) {
        if (!item) continue;
        const a = itemAttunement(registry, item);
        for (const m of MANA_TYPES) owned[m] += a[m];
      }
      let best: ManaType | null = null;
      for (const m of MANA_TYPES) if (m !== primary && owned[m] > (best ? owned[best] : 0)) best = m;
      if (!best) return p;
      p = bindSecondary(p, best).profile;
      if (!p.pair.secondary) return p;
    }
    const elements = [p.pair.primary!, p.pair.secondary!];
    return setAbility(registry, p, 'primary', { ...p.abilities.primary, elements });
  }

  /**
   * Between dives, as a player would: an overtaking secondary swaps in, the
   * builds keep to the pair (a no-op for the bot's own builds; it matters for a
   * continued `opts.profile`), a second element is bound (before anything is
   * salvaged) and the Primary built from both, then the forge visit.
   */
  export function betweenDives(registry: DataRegistry, profile: DelveProfile): DelveProfile {
    const settled = fixBuildsToPair(resolveOvertake(registry, profile).profile).profile;
    return visitForge(registry, bindBest(registry, settled));
  }
  ```

- `runAutopilot`: `let p = opts.profile ?? createDelveProfile(registry, opts.seed);` becomes `let p = opts.profile ?? createDelveProfile(registry, opts.seed, { primary: opts.primary ?? 'fire' });`, and `p = visitForge(registry, closeDive(p));` becomes `p = betweenDives(registry, closeDive(p));`.

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/engine && npx vitest run tests/delve-pair.test.ts && npx tsc --noEmit -p .)`
Expected: PASS, no type errors. (Don't judge the pacing test yet: that's Task 11.)

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/engine/tests/delve-pair.test.ts
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-pair.test.ts
git commit -m "feat(engine): the autopilot binds a second element, builds from both and overtakes"
```

---

### Task 11: The pacing gate (and a Frost primary)

**Files:**
- Modify: `packages/engine/tests/delve-pacing.test.ts`
- Modify (only if tuning is needed): `packages/engine/src/data/balance.json`, `packages/engine/tests/delve-pair.test.ts` (Task 1's numbers), `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (its Balance table)
- Create (scratch, never committed): `packages/engine/tests/scratch-pacing.test.ts`

- [ ] **Step 1: Add the Frost run**

In `tests/delve-pacing.test.ts`, after the `const runs … = SEEDS.map(…)` line, add:

```ts
/** A Frost hero (the starter gear re-attuned to frost) must still get deeper dive over dive. */
const FROST_SEEDS = [1, 2];
const frostRuns: AutopilotDiveReport[][] = FROST_SEEDS.map(
  (seed) => runAutopilot(registry, { seed, dives: DIVES, primary: 'frost' }).reports,
);
```

and inside the `describe`, after 'keeps progressing dive over dive', add:

```ts
  it('a Frost primary progresses too', () => {
    const end = (dive: number) => avg(frostRuns.map((r) => r[dive - 1].endDepth));
    expect(end(DIVES)).toBeGreaterThanOrEqual(end(1) + 5);
  });
```

- [ ] **Step 2: Run the gate**

Run: `(cd packages/engine && npx vitest run tests/delve-pacing.test.ts)`
(It takes a few seconds: the runs happen at collect time.)
Expected: PASS. If it does, skip to Step 5.

- [ ] **Step 3: If it fails, look at the curve**

Create `packages/engine/tests/scratch-pacing.test.ts` (scratch: never committed):

```ts
import { it } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { runAutopilot } from '../src/delve/autopilot.js';

/** SCRATCH (elemental affinity plan, Task 11): prints the pacing curve. Never commit. */
const registry = createDefaultRegistry();
const knobs = registry.getDelveBalance();
// Try a value here first, then copy the winner into balance.json:
// knobs.pair.basicPowerPerAttune = 0.03;
// knobs.pair.dropBias = 0.6;
// knobs.mana.poolPerAttune = 3;
void knobs;

it('prints the curve', () => {
  const plan = [
    ['fire', [1, 2, 3, 4]],
    ['frost', [1, 2]],
  ] as const;
  for (const [primary, seeds] of plan)
    for (const seed of seeds) {
      const r = runAutopilot(registry, { seed, dives: 12, primary }).reports;
      const perFloor = r.map((d) => d.floorSeconds / Math.max(1, d.endDepth - d.startDepth + 1));
      console.log(
        `${primary} ${seed}: ${r.map((d) => d.endDepth).join(' ')}` +
          ` | reactions ${r[11].reactionsSeen} | legendaries ${r[11].legendariesOwned}` +
          ` | s/floor ${Math.round(perFloor.reduce((a, b) => a + b, 0) / perFloor.length)}`,
      );
    }
});
```

Run: `(cd packages/engine && npx vitest run tests/scratch-pacing.test.ts)`
It prints each run's end depths per dive. Read which guard rail fails and why (the gate's rails: dive 1 ends between depths 4 and 12 on average, each run reaches depth 3; dive 12 is more than 5 deeper than dive 1 and deeper than dive 6; at least 1 legendary and fewer than all 12; at least 2 reactions; 8–60 s per floor; Frost: dive 12 at least 5 deeper than dive 1).

- [ ] **Step 4: Tune, in this order, one knob at a time**

Uncomment and change one knob in the scratch file, rerun, and stop at the first value that turns every rail green with some margin. Walk each knob in these steps before moving to the next:
1. `pair.basicPowerPerAttune`: 0.03 → 0.04 → 0.05 if the curve stalls (investment should pay); 0.03 → 0.02 if dive 1 runs too deep.
2. `pair.dropBias`: 0.6 → 0.7 → 0.8 if the bot starves for in-pair gear (a flat curve); 0.6 → 0.5 if early dives run away.
3. `mana.poolPerAttune`: 3 → 4 → 5 if abilities starve now that off-pair gear no longer grows the pool.

A red `reactionsSeen ≥ 2` is not a knob problem: check that Task 10's bot binds and builds its Primary from both elements. **Stop rule:** if none of the three knobs turns the gate green, stop and report the scratch output to the user before touching monster numbers (`monster.baseHp`, `growth.monsterHp`, the spec's last resort).

Copy the winning value into `src/data/balance.json` (by hand, keeping the layout). If a `pair` value changed, update Task 1's expected numbers in `tests/delve-pair.test.ts` and the spec's Balance table to match.

- [ ] **Step 5: Delete the scratch file, then run the whole engine**

Delete `tests/scratch-pacing.test.ts` first (it matches the test glob). Then run: `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)`
Expected: all green, the pacing gate included. `git status` shows no scratch file.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
git add packages/engine/tests/delve-pacing.test.ts
git commit -m "test(engine): a Frost primary progresses in the pacing run"
```

(If you tuned, also stage `packages/engine/src/data/balance.json`, `packages/engine/tests/delve-pair.test.ts` and the spec, and say what changed in the commit body, e.g. `fix(engine): tune basicPowerPerAttune to 0.04 for the pair's pacing`. If earlier commits named a red pacing assertion, say it is green again.)

---

## Chunk 4: Client: onto the pair, the store, and the choice

### Task 12: Rebuild the engine and move every client caller onto the pair

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts` (`loadDelveProfile`, the initial profile, `resetProfile`)
- Modify: `packages/client/src/stores/sandboxStore.ts` (`primary`, the basics-only pair)
- Modify: `packages/client/src/features/delve/arena/useArena.ts`, `packages/client/src/features/delve/PaperDoll.tsx`, `packages/client/src/features/delve/AbilitiesPanel.tsx` (the `AbilitiesPanel` wrapper), `packages/client/src/pages/DelveCamp.tsx` (`profileStats`)
- Modify: `packages/client/src/features/delve/BagPanel.tsx`, `packages/client/src/features/delve/LootTray.tsx`, `packages/client/src/features/delve/arena/PickupFeed.tsx`, `packages/client/src/features/delve/ItemDetailSheet.tsx` (`compareItem` with the pair)
- Test: `packages/client/src/stores/delveStore.test.ts`, `packages/client/src/stores/sandboxStore.test.ts`, `packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx`, `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`, `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

> Known transitional states (don't chase them): from this task until Task 15 the Anvil's element picker still offers every element, and picking one outside the pair makes `setAbility` throw; from Task 14 until Task 19 the E2E suites' saves have no primary, so they open on the choice screen (E2E runs only in Task 19).

- [ ] **Step 1: Rebuild the engine and see what breaks**

Run: `pnpm -F @alloy/engine build && (cd packages/client && npx tsc --noEmit -p .)`
Expected: the build succeeds; tsc FAILS in `src/stores/delveStore.ts` (`parseDelveProfile` now takes the registry and returns `{ profile, fixed }`) and `src/stores/sandboxStore.ts` (`basicInfusion` is no longer a `HeroStatsExtra`).

- [ ] **Step 2: Update the tests**

`src/stores/delveStore.test.ts`:
- `beforeEach`'s `useDelveStore.getState().resetProfile(1234);` becomes `useDelveStore.getState().resetProfile(1234, 'fire');`.
- In 'persists every profile change…', `expect(loadDelveProfile()?.dive?.depth).toBe(1);` becomes `expect(loadDelveProfile()?.profile.dive?.depth).toBe(1);`.
- Replace 'sets an ability build and persists it' (the Delve now refuses nature for a fire hero) with:

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
    });
  ```

- Append inside the `describe`:

  ```ts
    it('a reset takes a primary; without one the choice is still to make', () => {
      expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: null });
      useDelveStore.getState().resetProfile(99);
      expect(useDelveStore.getState().profile.pair.primary).toBeNull();
    });

    it('reads an older save back migrated, with the builds it fixed', () => {
      const { pair: _pair, manaDust: _dust, ...rest } = useDelveStore.getState().profile;
      const frostWard = { ...rest.abilities.defensive, elements: ['frost'] };
      localStorage.setItem(
        DELVE_SAVE_KEY,
        JSON.stringify({ ...rest, version: 3, abilities: { ...rest.abilities, defensive: frostWard } }),
      );
      const loaded = loadDelveProfile()!;
      expect(loaded.profile).toMatchObject({ version: 4, pair: { primary: 'fire', secondary: null } });
      expect(loaded.fixed.map((f) => f.slot)).toEqual(['defensive']);
    });
  ```

`src/stores/sandboxStore.test.ts`: replace the two tests "keeps a basic infusion: saved, ignored for the weapon's element, cleared by Load my build" and "drops the basic infusion when the new weapon's element matches it, and keeps it otherwise" with:

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
    expect(store().loadedWeapon?.mana).toBe('frost'); // the real item, its real mana
  });
```

`src/features/delve/__tests__/TrainingPanel.test.tsx`, in "a power from the loaded gear shows as on…": `.loadMyBuild({ equipped: { weapon }, abilities: defaultAbilities('fire') });` becomes `.loadMyBuild({ equipped: { weapon }, abilities: defaultAbilities('fire'), pair: { primary: 'fire', secondary: null } });`.

`src/features/delve/__tests__/AbilitiesPanel.test.tsx`:
- `beforeEach`'s `resetProfile(1234);` becomes `resetProfile(1234, 'fire');`.
- In 'shows the three default abilities and starter attunement': `'Frost Ward'` becomes `'Fire Ward'`, and `toHaveAttribute('data-value', '1')` becomes `toHaveAttribute('data-value', '2')` (the starter cuirass is re-attuned to fire).
- 'builds a Wildfire Burst…' starts, before `render`, with

  ```ts
      const s = useDelveStore.getState();
      s.setProfile({ ...s.profile, pair: { primary: 'fire', secondary: 'nature' } });
  ```

`src/features/delve/__tests__/ItemDetailSheet.test.tsx`: `resetProfile(1234);` becomes `resetProfile(1234, 'fire');`, and the test's helm is fire (off-pair gear attunes nothing now; Task 16 covers it):

```ts
  it('shows the item mana and the attunement equipping it would add', () => {
    const helm = generateItem(
      registry,
      { uid: 'h1', ilvl: 3, rarity: 'magic', slot: 'helm', mana: 'fire' },
      new SeededRNG(4),
    );
    const s = useDelveStore.getState();
    s.setProfile({ ...s.profile, bag: [helm] });
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('item-mana')).toHaveTextContent('Fire +1');
    expect(screen.getByTestId('attune-delta')).toHaveTextContent('+1 Fire');
    // The seed-4 helm also rolls a shadowAttune line: off the pair, so it attunes nothing.
    expect(screen.getByTestId('attune-delta')).not.toHaveTextContent('Shadow');
    expect(screen.getByTestId('attune-note')).toHaveTextContent('powers abilities');
  });
```

`src/pages/__tests__/DelveCamp.test.tsx`: `resetProfile(1234);` becomes `resetProfile(1234, 'fire');`.

- [ ] **Step 3: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/stores src/features/delve/__tests__/AbilitiesPanel.test.tsx src/features/delve/__tests__/ItemDetailSheet.test.tsx src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL (`loadDelveProfile` still calls the old signature; `resetProfile` still ignores the primary, so the starter cuirass stays earth and AbilitiesPanel's `attune-fire` reads 1, and the item sheet has no pair, so its compare shows the helm's `+1 Shadow`; `setPrimary` is not a function).

- [ ] **Step 4: `delveStore.ts`**

- Add `type ManaType,` and `type ParsedDelveProfile,` to the `@alloy/engine` import.
- Replace `loadDelveProfile` with:

  ```ts
  /** The saved profile (migrated when older, with the builds it fixed), or null. */
  export function loadDelveProfile(): ParsedDelveProfile | null {
    try {
      const raw = localStorage.getItem(DELVE_SAVE_KEY);
      if (!raw) return null;
      return parseDelveProfile(getDelveRegistry(), JSON.parse(raw));
    } catch {
      return null;
    }
  }
  ```

- In `interface DelveStore`, `resetProfile: (seed?: number) => void;` becomes

  ```ts
    /** A new save; with `primary` its mana is already chosen (tests, E2E). */
    resetProfile: (seed?: number, primary?: ManaType) => void;
  ```

- In the store, just before `return {`, add

  ```ts
    const loaded = loadDelveProfile();
    // A migrated save is written back at once.
    if (loaded) saveProfile(loaded.profile);
  ```

  and `profile: loadDelveProfile() ?? createDelveProfile(getDelveRegistry(), freshSeed()),` becomes `profile: loaded?.profile ?? createDelveProfile(getDelveRegistry(), freshSeed()),`.
- `resetProfile`: `commit(createDelveProfile(registry(), seed ?? freshSeed()));` becomes `commit(createDelveProfile(registry(), seed ?? freshSeed(), primary ? { primary } : {}));` and its parameter list `(seed) =>` becomes `(seed, primary) =>`.

- [ ] **Step 5: `sandboxStore.ts`**

- `SandboxLoadout`: replace the `basicInfusion` member (and its doc) with

  ```ts
    /** The sandbox hero's primary: what basic blows strike with (the weapon keeps its mana, for attunement). */
    primary: ManaType;
    /** The second element the combo's finisher discharges (null = none; never the primary). */
    basicInfusion: ManaType | null;
  ```

- `SANDBOX_DEFAULTS`: before `basicInfusion: null,` add `primary: 'fire',` (the default weapon's element).
- `loadoutSchema`: before `basicInfusion: ManaSchema.nullable().catch(null),` add `primary: ManaSchema.catch(D.primary),`.
- `parseSandbox`: `const s = parsed.data;` becomes

  ```ts
    // A Basic infusion is never the primary.
    const s =
      parsed.data.basicInfusion === parsed.data.primary
        ? { ...parsed.data, basicInfusion: null }
        : parsed.data;
  ```
- `interface SandboxStore`: replace the `setBasicInfusion` doc and add `setPrimary` above it:

  ```ts
    /** Pick the primary; a Basic infusion of that element is dropped. */
    setPrimary: (mana: ManaType) => void;
    /** The finisher's discharge (null = none); the primary is ignored. */
    setBasicInfusion: (mana: ManaType | null) => void;
  ```

  and `loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'abilities'>) => void;` becomes `loadMyBuild: (profile: Pick<DelveProfile, 'equipped' | 'abilities' | 'pair'>) => void;` with its doc `/** Copy the save's gear, builds and pair in (its powers and attunement then come from the items). */`.
- The store: replace the `setWeapon` entry (and the comment above it) with

  ```ts
      // Re-clicking the pressed chip changes nothing (so a loaded weapon survives it).
      setWeapon: (weapon) => {
        if (sameChoice(weapon, get().weapon)) return;
        commit({ weapon, loadedWeapon: null });
      },
  ```

  replace the `setBasicInfusion` entry with

  ```ts
      setPrimary: (primary) =>
        commit({ primary, ...(primary === get().basicInfusion ? { basicInfusion: null } : {}) }),
      setBasicInfusion: (basicInfusion) => {
        if (basicInfusion !== get().primary) commit({ basicInfusion });
      },
  ```

  and in `loadMyBuild`'s `commit({ … })`, `basicInfusion: null,` becomes

  ```ts
          // Your pair: the loaded weapon keeps its real mana (the weapon check relies on it).
          primary: profile.pair.primary ?? get().primary,
          basicInfusion: profile.pair.secondary,
  ```

- `StatsInput`: `'weapon' | 'loadedWeapon' | 'gear' | 'legendaries' | 'attunement' | 'depth' | 'basicInfusion'` becomes `'weapon' | 'loadedWeapon' | 'gear' | 'legendaries' | 'attunement' | 'depth' | 'primary' | 'basicInfusion'`.
- `sandboxStats`: the extra becomes

  ```ts
    return computeHeroStats(sandboxEquipped(registry, s), registry, {
      legendaries: s.legendaries,
      attunement: s.attunement,
      // Basics only: blows strike with the primary and the finisher discharges the infusion,
      // unarmed too. Every element still attunes: the sandbox stays unrestricted.
      pair: { primary: s.primary, secondary: s.basicInfusion },
      filterAttunement: false,
    });
  ```

- `useSandboxStats`: after `const depth = …` add `const primary = useSandboxStore((s) => s.primary);`, add `primary,` to the `sandboxStats(…)` input (after `depth,`) and to the memo's dependencies: `[weapon, loadedWeapon, gear, legendaries, attunement, depth, primary, basicInfusion]`.

- [ ] **Step 6: Real stats on the Anvil, the arena and every comparison**

- `src/features/delve/arena/useArena.ts`: in the `@alloy/engine` import, `computeHeroStats,` becomes `profileStats,`; the stats memo becomes

  ```ts
    const { equipped, pair } = profile;
    const stats = useMemo(() => profileStats(registry, { equipped, pair }), [equipped, pair, registry]);
  ```

- `src/features/delve/PaperDoll.tsx`: the import becomes `import { estimateCombat, profileStats, referenceDepth, type GearSlot } from '@alloy/engine';` and its stats memo becomes the same two lines as `useArena`'s.
- `src/features/delve/AbilitiesPanel.tsx`: in the `@alloy/engine` import, `computeHeroStats,` becomes `profileStats,`; in the `AbilitiesPanel` wrapper, the stats memo becomes the same two lines as `useArena`'s.
- `src/pages/DelveCamp.tsx`: in the `@alloy/engine` import, `computeAttunement,` becomes `profileStats,`; the attunement memo becomes

  ```ts
    const { equipped, pair } = profile;
    const attunement = useMemo(
      () => profileStats(registry, { equipped, pair }).attunement,
      [equipped, pair, registry],
    );
  ```

- `compareItem(profile.equipped, <item>, registry, depth)` gains `, undefined, profile.pair` in `BagPanel.tsx` (the rows memo; add `profile.pair` to its dependencies), `LootTray.tsx` and `arena/PickupFeed.tsx` (their rows memos already depend on `profile`), and `ItemDetailSheet.tsx` (the `cmp` memo; add `profile.pair` to its dependencies).

- [ ] **Step 7: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all client tests PASS.

- [ ] **Step 8: Restart the dev server**

Run the dev-server block (header). Expected: `True`.

- [ ] **Step 9: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/PaperDoll.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/arena/PickupFeed.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/stores/sandboxStore.ts packages/client/src/stores/sandboxStore.test.ts packages/client/src/features/delve/arena/useArena.ts packages/client/src/features/delve/PaperDoll.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/features/delve/BagPanel.tsx packages/client/src/features/delve/LootTray.tsx packages/client/src/features/delve/arena/PickupFeed.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/__tests__/AbilitiesPanel.test.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): real stats, comparisons and the Training Grounds read the hero's pair"
```

---

### Task 13: The store's pair actions and notices

**Files:**
- Modify: `packages/client/src/stores/delveStore.ts`
- Create: `packages/client/src/features/delve/useDelveNotices.ts`
- Modify: `packages/client/src/pages/DelveCamp.tsx`, `packages/client/src/pages/DelveRun.tsx`
- Test: `packages/client/src/stores/delveStore.test.ts`, `packages/client/src/pages/__tests__/DelveCamp.test.tsx`, `packages/client/src/features/delve/__tests__/useDelveNotices.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

`src/stores/delveStore.test.ts`: the imports become

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { generateItem, SeededRNG, type BuildFix, type GearSlot } from '@alloy/engine';
import {
  useDelveStore,
  DELVE_SAVE_KEY,
  MANUAL_ATTACK_KEY,
  fixNotice,
  loadDelveProfile,
  overtakeNotice,
} from './delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
```

and append inside the `describe`:

```ts
  it('chooses the mana once, binds a second element, and remembers a declined bind this session', () => {
    const s = () => useDelveStore.getState();
    s().resetProfile(5);
    expect(s().chooseMana('frost').ok).toBe(true);
    expect(s().profile.pair.primary).toBe('frost');
    expect(loadDelveProfile()?.profile.pair.primary).toBe('frost');
    expect(s().chooseMana('fire').ok).toBe(false);
    expect(s().bindSecondary('storm').ok).toBe(true);
    expect(s().profile.pair).toEqual({ primary: 'frost', secondary: 'storm' });
    s().declineBind('nature');
    s().declineBind('nature');
    expect(s().bindDeclined).toEqual(['nature']);
    s().resetProfile(5);
    expect(s().bindDeclined).toEqual([]);
  });

  it('closing a dive lets an overtaking secondary swap in, with a notice', () => {
    const storm = (slot: GearSlot) =>
      generateItem(registry, { uid: `s-${slot}`, ilvl: 1, rarity: 'common', slot, mana: 'storm' }, new SeededRNG(1));
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      equipped: { ...s.profile.equipped, helm: storm('helm'), gloves: storm('gloves'), boots: storm('boots') },
    }); // storm 3 > 1.2 × fire 2
    useDelveStore.getState().startDive(1);
    useDelveStore.getState().closeDive();
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'storm', secondary: 'fire' });
    expect(useDelveStore.getState().takeNotices()).toEqual([
      'Storm now outweighs Fire: your basic attacks strike with Storm',
    ]);
    expect(useDelveStore.getState().takeNotices()).toEqual([]);
  });

  it('realign charges and says which builds it changed; re-attune spends Mana Dust', () => {
    const s = useDelveStore.getState();
    s.setProfile({
      ...s.profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: 500,
      scrap: 500,
      abilities: {
        ...s.profile.abilities,
        ultimate: { form: 'maelstrom', elements: ['storm'], weight: 0, payment: 'charge' },
      },
    });
    expect(useDelveStore.getState().realign({ secondary: 'frost' }).ok).toBe(true);
    expect(useDelveStore.getState().profile.pair).toEqual({ primary: 'fire', secondary: 'frost' });
    expect(useDelveStore.getState().takeNotices()).toEqual([
      "Your Maelstrom used Storm, which isn't in your pair; it now uses Fire",
    ]);
    const uid = useDelveStore.getState().profile.equipped.weapon!.uid;
    const dust = useDelveStore.getState().profile.manaDust;
    expect(useDelveStore.getState().reattune(uid, 'frost').ok).toBe(true);
    expect(useDelveStore.getState().profile.equipped.weapon!.mana).toBe('frost');
    expect(useDelveStore.getState().profile.manaDust).toBe(
      dust - registry.getDelveBalance().pair.reattuneDust.common,
    );
  });

  it('words the notices plainly', () => {
    const fix: BuildFix = {
      slot: 'ultimate',
      removed: ['frost', 'storm'],
      build: { form: 'maelstrom', elements: ['fire'], weight: 0, payment: 'charge' },
    };
    expect(fixNotice(registry, fix)).toBe(
      "Your Maelstrom used Frost and Storm, which aren't in your pair; it now uses Fire",
    );
    expect(overtakeNotice(registry, 'storm', 'fire')).toBe(
      'Storm now outweighs Fire: your basic attacks strike with Storm',
    );
  });
```

`src/pages/__tests__/DelveCamp.test.tsx`: add `import { act } from '@testing-library/react';` (merge it into the existing `@testing-library/react` import) and append inside the `describe`:

```ts
  it('shows waiting notices as toasts, once', () => {
    const text = 'Storm now outweighs Fire: your basic attacks strike with Storm';
    act(() => useDelveStore.setState({ notices: [text] }));
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(useDelveStore.getState().notices).toEqual([]);
  });
```

Create `src/features/delve/__tests__/useDelveNotices.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDelveStore } from '@/stores/delveStore';
import { useDelveNotices } from '../useDelveNotices';

describe('useDelveNotices', () => {
  beforeEach(() => useDelveStore.setState({ notices: ['Storm now outweighs Fire'] }));

  it('takes the notices when enabled', () => {
    renderHook(() => useDelveNotices());
    expect(useDelveStore.getState().notices).toEqual([]);
  });

  it('leaves them in the store while disabled (a page with no toasts to show them)', () => {
    renderHook(() => useDelveNotices(false));
    expect(useDelveStore.getState().notices).toEqual(['Storm now outweighs Fire']);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/stores/delveStore.test.ts src/pages/__tests__/DelveCamp.test.tsx src/features/delve/__tests__/useDelveNotices.test.ts)`
Expected: FAIL (`chooseMana`, `fixNotice` and friends don't exist; no toast; `../useDelveNotices` doesn't exist).

- [ ] **Step 3: The store**

In `src/stores/delveStore.ts`:
- Add to the `@alloy/engine` import: `bindSecondary as engineBindSecondary,`, `chooseStartingMana,`, `realign as engineRealign,`, `reattuneItem,`, `resolveOvertake,`, `type BuildFix,`, `type DataRegistry,`.
- Below `freshSeed`, add:

  ```ts
  const manaName = (registry: DataRegistry, m: ManaType) => registry.getArpgData().mana[m].name;
  const manaNames = (registry: DataRegistry, els: ManaType[]) =>
    els.map((m) => manaName(registry, m)).join(' and ');

  /** "Your Maelstrom used Frost, which isn't in your pair; it now uses Fire" */
  export function fixNotice(registry: DataRegistry, fix: BuildFix): string {
    const form = registry.getForm(fix.build.form).name;
    const isnt = fix.removed.length > 1 ? "aren't" : "isn't";
    return `Your ${form} used ${manaNames(registry, fix.removed)}, which ${isnt} in your pair; it now uses ${manaNames(registry, fix.build.elements)}`;
  }

  /** "Storm now outweighs Fire: your basic attacks strike with Storm" (`now` is the new primary). */
  export function overtakeNotice(registry: DataRegistry, now: ManaType, was: ManaType): string {
    const name = manaName(registry, now);
    return `${name} now outweighs ${manaName(registry, was)}: your basic attacks strike with ${name}`;
  }
  ```

- `interface DelveStore`: after `manualAttack: boolean;` add

  ```ts
    /** Toasts waiting for a Delve screen to show them (session only): overtakes, fixed builds. */
    notices: string[];
    /** Elements whose bind prompt was answered "Not now" this session (never saved). */
    bindDeclined: ManaType[];
  ```

  replace `closeDive: () => void;` with

  ```ts
    /** Close the finished (or abandoned) dive; a secondary that has overtaken swaps in, with a notice. */
    closeDive: () => void;
    /** The one-time "Choose your mana". */
    chooseMana: (mana: ManaType) => ProfileActionResult;
    bindSecondary: (mana: ManaType) => ProfileActionResult;
    /** Change the bound pair; the builds it had to change become notices. */
    realign: (next: { primary?: ManaType; secondary?: ManaType }) => ProfileActionResult;
    reattune: (uid: string, mana: ManaType) => ProfileActionResult;
    declineBind: (mana: ManaType) => void;
    /** Hand over the waiting notices, and forget them. */
    takeNotices: () => string[];
  ```

- In the store, after `const applyResult = …;` add `const notify = (text: string) => set({ notices: [...get().notices, text] });`.
- In the returned state, after `manualAttack: loadManualAttack(),` add

  ```ts
      notices: loaded ? loaded.fixed.map((f) => fixNotice(getDelveRegistry(), f)) : [],
      bindDeclined: [],
  ```

- `resetProfile`'s `set({ newUids: {}, diveDrops: [] });` becomes `set({ newUids: {}, diveDrops: [], notices: [], bindDeclined: [] });`.
- Replace `closeDive: () => commit(engineCloseDive(get().profile)),` with

  ```ts
      closeDive: () => {
        const res = resolveOvertake(registry(), engineCloseDive(get().profile));
        commit(res.profile);
        const { primary, secondary } = res.profile.pair;
        if (res.swapped) notify(overtakeNotice(registry(), primary!, secondary!));
      },

      chooseMana: (mana) => applyResult(chooseStartingMana(registry(), get().profile, mana)),

      bindSecondary: (mana) => applyResult(engineBindSecondary(get().profile, mana)),

      realign: (next) => {
        const res = applyResult(engineRealign(registry(), get().profile, next));
        for (const fix of res.fixed ?? []) notify(fixNotice(registry(), fix));
        return res;
      },

      reattune: (uid, mana) => applyResult(reattuneItem(registry(), get().profile, uid, mana)),

      declineBind: (mana) => {
        if (!get().bindDeclined.includes(mana)) set({ bindDeclined: [...get().bindDeclined, mana] });
      },

      takeNotices: () => {
        const notices = get().notices;
        if (notices.length > 0) set({ notices: [] });
        return notices;
      },
  ```

- [ ] **Step 4: The toasts**

Create `src/features/delve/useDelveNotices.ts`:

```ts
import { useEffect } from 'react';
import { showToast } from '@/components/Toast';
import { useDelveStore } from '@/stores/delveStore';

/**
 * Show the Delve's waiting notices (an overtake, builds a realign or a save
 * migration changed) as toasts. Call it in a page that renders a
 * ToastContainer: the page's effect runs after its children's, so the
 * container is listening. Pass `enabled = false` while the page renders no
 * ToastContainer, and the notices wait for the next page. Taking them from
 * the store makes a StrictMode re-run a no-op.
 */
export function useDelveNotices(enabled = true): void {
  const count = useDelveStore((s) => s.notices.length);
  useEffect(() => {
    if (!enabled || count === 0) return;
    for (const text of useDelveStore.getState().takeNotices()) showToast(text);
  }, [count, enabled]);
}
```

In `src/pages/DelveCamp.tsx` add `import { useDelveNotices } from '@/features/delve/useDelveNotices';` and, after `const [controlsOpen, setControlsOpen] = useState(false);`, call `useDelveNotices();`. In `src/pages/DelveRun.tsx` add the same import and call `useDelveNotices(!!dive);` after `const noManaToast = useMemo(() => noManaToaster(), []);` (`dive` is declared above it). With no dive, DelveRun renders nothing, not even its ToastContainer: after Abandon, `closeDive` commits before the navigation to the Anvil (react-router wraps `navigate` in a transition), and a page opened on `/delve/run` with no dive bounces the same way. So it leaves the notices for DelveCamp.

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all PASS.

- [ ] **Step 6: Restart the dev server**

The store gained fields, and `createHmrStore` hands a hot reload the cached store (with no `notices`), so the Anvil's `useDelveNotices` would throw until a restart. Run the dev-server block (header). Expected: `True`.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/useDelveNotices.ts packages/client/src/features/delve/__tests__/useDelveNotices.test.ts packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git add packages/client/src/stores/delveStore.ts packages/client/src/stores/delveStore.test.ts packages/client/src/features/delve/useDelveNotices.ts packages/client/src/features/delve/__tests__/useDelveNotices.test.ts packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/DelveRun.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): the store chooses, binds, realigns and re-attunes, and toasts the notices"
```

---

### Task 14: Choose your mana

**Files:**
- Create: `packages/client/src/features/delve/ManaChoice.tsx`
- Modify: `packages/client/src/pages/DelveCamp.tsx`
- Test: `packages/client/src/pages/__tests__/DelveCamp.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/pages/__tests__/DelveCamp.test.tsx`, append inside the `describe`:

```ts
  it('a new save chooses its mana first; Frost starts with frost gear and frost abilities', () => {
    useDelveStore.getState().resetProfile(99); // no primary yet
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    const choice = screen.getByTestId('mana-choice');
    expect(choice).toHaveAttribute('data-pad-scope');
    const storm = screen.getByTestId('mana-choice-storm');
    expect(storm).toHaveTextContent('Storm chains');
    expect(storm).toHaveTextContent('Shock');
    expect(storm).toHaveTextContent('Superconductor');
    fireEvent.click(screen.getByTestId('mana-choice-frost'));
    expect(screen.queryByTestId('mana-choice')).toBeNull();
    const p = useDelveStore.getState().profile;
    expect(p.pair).toEqual({ primary: 'frost', secondary: null });
    expect(p.equipped.weapon!.mana).toBe('frost');
    expect(p.abilities.defensive.elements).toEqual(['frost']);
  });

  it('asks nothing once the mana is chosen', () => {
    render(
      <MemoryRouter>
        <DelveCamp />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('mana-choice')).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/pages/__tests__/DelveCamp.test.tsx)`
Expected: FAIL (no `mana-choice`).

- [ ] **Step 3: Implement**

Create `src/features/delve/ManaChoice.tsx`:

```tsx
import { BASIC_STATUS, MANA_TYPES, type ManaType } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { manaStyle } from './format';

/** Each element's play style, in a line. */
const PLAY_STYLE: Record<ManaType, string> = {
  fire: 'Fire burns: your hits keep hurting after they land.',
  frost: 'Frost controls: chill foes, then freeze them solid.',
  storm: 'Storm chains: shocks leap from foe to foe.',
  earth: 'Earth staggers: heavy blows that stop foes cold.',
  shadow: 'Shadow hexes: cursed foes take more from everything.',
  nature: 'Nature poisons: stacking venom that rots foes away.',
};

const title = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The one-time "Choose your mana" screen, over the Anvil while the hero has
 * no primary: your starting gear attunes to it and your first abilities use it.
 */
export function ManaChoice() {
  const registry = getDelveRegistry();
  const fusions = registry.getArpgData().fusions;
  const choose = (mana: ManaType) => {
    playSound('orbConfirm');
    vibrate('success');
    useDelveStore.getState().chooseMana(mana);
  };
  return (
    <div
      className="absolute inset-0 z-[70] overflow-y-auto bg-black/90"
      role="dialog"
      aria-label="Choose your mana"
      data-testid="mana-choice"
      data-pad-scope
    >
      <div className="delve-column flex flex-col gap-3 py-6">
        <div className="delve-display text-center text-2xl font-bold text-amber-300">
          Choose your mana
        </div>
        <p className="text-center text-sm text-stone-300">
          Your gear attunes to it, your blows strike with it, and your first abilities use it.
          Between dives you'll bind a second element: your combo's finisher discharges it.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MANA_TYPES.map((m) => {
            const st = manaStyle(registry, m);
            const mixes = fusions.filter((f) => f.elements.includes(m));
            return (
              <button
                key={m}
                type="button"
                className="delve-panel flex flex-col items-start gap-1 p-3 text-left"
                style={{ borderColor: `${st.color}66` }}
                onClick={() => choose(m)}
                data-testid={`mana-choice-${m}`}
              >
                <span className="delve-display text-lg font-bold" style={{ color: st.color }}>
                  {st.icon} {st.name}
                </span>
                <span className="text-sm text-stone-200">{PLAY_STYLE[m]}</span>
                <span className="text-[11px] text-stone-400">
                  Basic status: {title(BASIC_STATUS[m])}
                </span>
                <span className="text-[11px] text-stone-500">
                  Fusions: {mixes.map((f) => `${f.icon} ${f.name}`).join(' · ')}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

In `src/pages/DelveCamp.tsx`: add `import { ManaChoice } from '@/features/delve/ManaChoice';`, and after `{controlsOpen && <ControlsPanel onClose={() => setControlsOpen(false)} />}` add

```tsx
      {profile.pair.primary === null && <ManaChoice />}
```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/ManaChoice.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git add packages/client/src/features/delve/ManaChoice.tsx packages/client/src/pages/DelveCamp.tsx packages/client/src/pages/__tests__/DelveCamp.test.tsx
git commit -m "feat(client): a new hero chooses its mana on the Anvil"
```

---

## Chunk 5: Client: the Mana view and the item sheet

### Task 15: The Mana view and the pair-limited picker

**Files:**
- Create: `packages/client/src/features/delve/ManaPanel.tsx`
- Modify: `packages/client/src/features/delve/AbilitiesPanel.tsx` (`AttunementBars`, `AbilityEditor`, the `AbilitiesPanel` wrapper)
- Create: `packages/client/src/features/delve/__tests__/ManaPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/features/delve/__tests__/ManaPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG, type ManaType } from '@alloy/engine';
import { AbilitiesPanel } from '../AbilitiesPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

const registry = getDelveRegistry();
const store = () => useDelveStore.getState();
const helm = (mana: ManaType) =>
  generateItem(
    registry,
    { uid: `h-${mana}`, ilvl: 1, rarity: 'common', slot: 'helm', mana },
    new SeededRNG(1),
  );

describe('the Mana view (the Anvil, Abilities tab)', () => {
  beforeEach(() => {
    localStorage.clear();
    store().resetProfile(1234, 'fire');
  });

  it('binds a second element you own gear in, after a confirmation that shows the Power', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-primary')).toHaveTextContent('Fire');
    expect(screen.getByTestId('pair-secondary')).toHaveTextContent('No second element yet');
    expect(screen.queryByTestId('mana-bind-nature')).toBeNull(); // no nature gear
    fireEvent.click(screen.getByTestId('mana-bind-storm'));
    expect(screen.getByTestId('mana-bind-storm')).toHaveTextContent('Power');
    fireEvent.click(screen.getByTestId('mana-bind-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(screen.getByTestId('overtake')).toHaveTextContent('to overtake Fire');
    expect(screen.getAllByTestId(/^attune-/)).toHaveLength(2); // the pair's bars only
  });

  it('shows the Mana Dust, and realigns for its cost', () => {
    const { realignDust, realignScrap } = registry.getDelveBalance().pair;
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: realignDust,
      scrap: realignScrap,
    });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('mana-dust')).toHaveTextContent(`✦ ${realignDust} Mana Dust`);
    expect(screen.getByTestId('realign-button')).toBeDisabled(); // nothing changed yet
    fireEvent.click(screen.getByTestId('realign-secondary-nature'));
    fireEvent.click(screen.getByTestId('realign-button'));
    expect(store().profile).toMatchObject({
      pair: { primary: 'fire', secondary: 'nature' },
      manaDust: 0,
      scrap: 0,
    });
  });

  it('binding and realigning wait for the dive to end, and say so', () => {
    store().setProfile({ ...store().profile, bag: [helm('storm')] });
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-locked')).toHaveTextContent('between dives');
    expect(screen.getByTestId('mana-bind-storm')).toBeDisabled();
  });

  it('realign waits for the dive to end too', () => {
    const { realignDust, realignScrap } = registry.getDelveBalance().pair;
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: realignDust,
      scrap: realignScrap,
    });
    store().startDive(1);
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('pair-locked')).toBeInTheDocument();
    expect(screen.getByTestId('realign-secondary-nature')).toBeDisabled();
    expect(screen.getByTestId('realign-button')).toBeDisabled();
  });

  it('the element picker offers only the pair', () => {
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    render(<AbilitiesPanel />);
    expect(screen.getByTestId('element-fire')).toBeInTheDocument();
    expect(screen.getByTestId('element-storm')).toBeInTheDocument();
    expect(screen.queryByTestId('element-frost')).toBeNull();
    expect(screen.getByTestId('infusion-storm')).toBeInTheDocument();
    expect(screen.queryByTestId('infusion-nature')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ManaPanel.test.tsx)`
Expected: FAIL (no `pair-primary`; every element in the picker).

- [ ] **Step 3: `ManaPanel.tsx`**

Create `src/features/delve/ManaPanel.tsx`:

```tsx
import { useState } from 'react';
import {
  GEAR_SLOTS,
  MANA_TYPES,
  isDiveActive,
  profilePower,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { AttunementBars, Chip } from './AbilitiesPanel';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * The Anvil's Mana view: your primary and secondary with their attunement, how
 * near the secondary is to overtaking, your Mana Dust, and binding a second
 * element or realigning the pair (between dives only). The rules are the
 * engine's (`bindSecondary`, `realign`, `resolveOvertake`).
 */
export function ManaPanel({ stats }: { stats: HeroStats }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const [binding, setBinding] = useState<ManaType | null>(null);
  const [target, setTarget] = useState<{ primary?: ManaType; secondary?: ManaType }>({});
  const [message, setMessage] = useState<string | null>(null);
  const { primary, secondary } = profile.pair;
  if (!primary) return <AttunementBars stats={stats} />;

  const cost = registry.getDelveBalance().pair;
  const att = stats.attunement;
  const locked = isDiveActive(profile);
  const style = (m: ManaType) => manaStyle(registry, m);
  const owned = new Set<ManaType>([
    ...GEAR_SLOTS.flatMap((s) => profile.equipped[s]?.mana ?? []),
    ...profile.bag.map((i) => i.mana),
  ]);
  const candidates = MANA_TYPES.filter((m) => m !== primary && owned.has(m));
  const need = cost.overtakeMargin * att[primary];
  const next = secondary
    ? { primary: target.primary ?? primary, secondary: target.secondary ?? secondary }
    : null;
  const changed =
    !!next &&
    next.primary !== next.secondary &&
    (next.primary !== primary || next.secondary !== secondary);

  const onBind = (mana: ManaType) => {
    const res = useDelveStore.getState().bindSecondary(mana);
    setBinding(null);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot bind'));
  };
  const onRealign = () => {
    if (!next) return;
    const res = useDelveStore.getState().realign(next);
    playSound(res.ok ? 'upgradeTier' : 'combineFail');
    setMessage(res.ok ? null : (res.reason ?? 'Cannot realign'));
    if (res.ok) setTarget({});
  };

  return (
    <section className="flex flex-col gap-2" data-testid="mana-view">
      <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
        Your mana
      </div>
      <div className="flex flex-col gap-0.5 text-sm">
        <span data-testid="pair-primary" style={{ color: style(primary).color }}>
          {style(primary).icon} {style(primary).name} · primary: your blows strike with it
        </span>
        <span
          data-testid="pair-secondary"
          style={{ color: secondary ? style(secondary).color : '#78716c' }}
        >
          {secondary
            ? `${style(secondary).icon} ${style(secondary).name} · secondary: your combo finisher discharges it`
            : 'No second element yet'}
        </span>
      </div>
      <AttunementBars stats={stats} elements={secondary ? [primary, secondary] : [primary]} />
      {secondary && (
        <div className="flex flex-col gap-1 text-xs text-stone-400" data-testid="overtake">
          <span>
            {style(secondary).name} {att[secondary]} / {need.toFixed(1)} to overtake{' '}
            {style(primary).name} (checked when a dive ends)
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                // Empty until the secondary has any attunement (it can't overtake at 0).
                width: `${att[secondary] > 0 ? Math.min(1, need > 0 ? att[secondary] / need : 1) * 100 : 0}%`,
                background: style(secondary).color,
              }}
            />
          </div>
        </div>
      )}
      <div className="text-xs text-stone-300" data-testid="mana-dust">
        ✦ {formatNumber(profile.manaDust)} Mana Dust · from salvaging gear outside your pair
      </div>
      {locked && (
        <div className="delve-panel p-2 text-center text-xs text-amber-200" data-testid="pair-locked">
          A dive is under way: bind and realign between dives.
        </div>
      )}
      {!secondary && (
        <div className="flex flex-col gap-1.5" data-testid="bind-section">
          <div className="text-xs text-stone-400">
            Bind a second element: your combo finisher discharges it and your abilities can use it.
            Power now {formatNumber(profilePower(registry, profile))}.
          </div>
          {candidates.length === 0 ? (
            <div className="text-xs text-stone-500">Find gear of another element to bind it.</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((m) => (
                <Chip
                  key={m}
                  pressed={binding === m}
                  disabled={locked}
                  onClick={() => setBinding(m)}
                  testId={`mana-bind-${m}`}
                >
                  {style(m).icon} {style(m).name} · Power{' '}
                  {formatNumber(
                    profilePower(registry, { ...profile, pair: { primary, secondary: m } }),
                  )}
                </Chip>
              ))}
            </div>
          )}
          {binding && !locked && (
            <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="mana-bind-ask">
              <span className="text-stone-300">
                Bind {style(binding).name}? After that, only a Realign changes it.
              </span>
              <button
                type="button"
                className="delve-btn delve-btn-gold px-2.5 py-1 text-xs"
                onClick={() => onBind(binding)}
                data-testid="mana-bind-confirm"
              >
                Bind
              </button>
              <button
                type="button"
                className="delve-btn px-2.5 py-1 text-xs"
                onClick={() => setBinding(null)}
                data-testid="mana-bind-cancel"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {next && (
        <div className="flex flex-col gap-1.5" data-testid="realign-section">
          <div className="text-xs text-stone-400">
            Realign: change your pair for ✦ {cost.realignDust} Mana Dust and ⚙ {cost.realignScrap}{' '}
            scrap. Gear stays as it is; abilities follow the new pair.
          </div>
          {(['primary', 'secondary'] as const).map((role) => (
            <div key={role} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 text-[11px] text-stone-500">
                {role === 'primary' ? 'Primary' : 'Secondary'}
              </span>
              {MANA_TYPES.map((m) => (
                <Chip
                  key={m}
                  pressed={next[role] === m}
                  disabled={locked}
                  onClick={() =>
                    setTarget(role === 'primary' ? { ...next, primary: m } : { ...next, secondary: m })
                  }
                  testId={`realign-${role}-${m}`}
                  title={style(m).name}
                >
                  {style(m).icon}
                </Chip>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="delve-btn delve-btn-gold text-sm"
            disabled={locked || !changed}
            onClick={onRealign}
            data-testid="realign-button"
          >
            Realign · ✦ {cost.realignDust} · ⚙ {cost.realignScrap}
          </button>
        </div>
      )}
      {message && (
        <div className="text-xs font-semibold text-red-300" role="status">
          {message}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: `AbilitiesPanel.tsx`**

- `import { useMemo, useState } from 'react';` becomes `import { useMemo, useState, type ReactNode } from 'react';`; add `pairElements,` to the `@alloy/engine` import; add `import { ManaPanel } from './ManaPanel';` (a render-time cycle with `ManaPanel`, which borrows `AttunementBars` and `Chip`: harmless).
- `AttunementBars`: its signature becomes

  ```tsx
  /** Attunement per element (all six, or just `elements`) with the mastery threshold, and the one mana pool it feeds. */
  export function AttunementBars({
    stats,
    elements = MANA_TYPES,
  }: {
    stats: HeroStats;
    elements?: readonly ManaType[];
  }) {
  ```

  and inside it `...MANA_TYPES.map((m) => attunement[m] + 1)` becomes `...elements.map((m) => attunement[m] + 1)` and `{MANA_TYPES.map((m) => {` becomes `{elements.map((m) => {`.
- `AbilityEditorProps`: after `onChange: …;` add

  ```ts
    /** The elements the picker offers (the Delve: your pair); all six when absent. */
    elements?: readonly ManaType[];
    /** Shown in place of the attunement bars (the Anvil's Mana view). */
    mana?: ReactNode;
  ```

- `AbilityEditor`'s destructured props gain `elements = MANA_TYPES,` and `mana,`; its element chips `{MANA_TYPES.map((m) => (` become `{elements.map((m) => (`; its infusion chips `{MANA_TYPES.filter((m) => m !== main).map((m) => (` become `{elements.filter((m) => m !== main).map((m) => (`; and the Attunement section

  ```tsx
        <section className="flex flex-col gap-1.5">
          <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
            Attunement
          </div>
          <AttunementBars stats={stats} />
        </section>
  ```

  becomes

  ```tsx
        {mana ?? (
          <section className="flex flex-col gap-1.5">
            <div className="delve-display text-xs font-bold uppercase tracking-widest text-amber-300/80">
              Attunement
            </div>
            <AttunementBars stats={stats} />
          </section>
        )}
  ```

- The `AbilitiesPanel` wrapper: its doc becomes `/** The Anvil's workshop: the save's builds from your two elements, and your Mana view; read-only while a dive is under way. */`; after the stats memo add `const elements = pairElements(pair);`, and the `<AbilityEditor … />` gains

  ```tsx
        elements={elements.length > 0 ? elements : undefined}
        mana={<ManaPanel stats={stats} />}
  ```

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__)`
Expected: no type errors; PASS (AbilitiesPanel's own tests too: the Wildfire test binds nature first, the `AbilityEditor` tests pass no `elements` and still see six bars).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/__tests__/ManaPanel.test.tsx
git add packages/client/src/features/delve/ManaPanel.tsx packages/client/src/features/delve/AbilitiesPanel.tsx packages/client/src/features/delve/__tests__/ManaPanel.test.tsx
git commit -m "feat(client): the Mana view binds and realigns; the Delve's picker offers only the pair"
```

---

### Task 16: The item sheet: off-pair lines, Mana Dust, Re-attune, and the bind prompt

**Files:**
- Create: `packages/client/src/features/delve/BindPrompt.tsx`
- Modify: `packages/client/src/features/delve/ItemDetailSheet.tsx`
- Test: `packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/features/delve/__tests__/ItemDetailSheet.test.tsx`, the imports become

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { generateItem, SeededRNG, type GearItem, type ManaType } from '@alloy/engine';
import { ItemDetailSheet } from '../ItemDetailSheet';
import { BagPanel } from '../BagPanel';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';
import { ToastContainer } from '@/components/Toast';
```

below `const registry = getDelveRegistry();` add

```tsx
const store = () => useDelveStore.getState();
const pal = registry.getDelveBalance().pair;
/** A magic helm with only the lines given as affixes. */
const helm = (mana: ManaType, uid = 'h1', affixes: GearItem['affixes'] = []): GearItem => ({
  ...generateItem(registry, { uid, ilvl: 3, rarity: 'magic', slot: 'helm', mana }, new SeededRNG(4)),
  affixes,
});
const put = (...bag: GearItem[]) => store().setProfile({ ...store().profile, bag });
```

and append inside the `describe`:

```tsx
  it('greys attunement outside the pair, and shows the Mana Dust salvage gives', () => {
    put(
      helm('frost', 'h1', [
        { stat: 'fireAttune', value: 2, roll: 0.5 },
        { stat: 'frostAttune', value: 2, roll: 0.5 },
      ]),
    );
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('item-mana')).toHaveTextContent('not your element');
    expect(screen.getAllByTestId('not-your-element')).toHaveLength(1); // frost's line; fire's counts
    expect(screen.getByTestId('salvage-button')).toHaveTextContent(`✦ ${pal.salvageDust.magic}`);
  });

  it("re-attunes to the pair's other element for Mana Dust", () => {
    put(helm('frost'));
    store().setProfile({
      ...store().profile,
      pair: { primary: 'fire', secondary: 'storm' },
      manaDust: pal.reattuneDust.magic,
    });
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('reattune-fire')).toHaveTextContent(`✦ ${pal.reattuneDust.magic}`);
    fireEvent.click(screen.getByTestId('reattune-storm'));
    expect(store().profile.bag[0].mana).toBe('storm');
    expect(store().profile.manaDust).toBe(0);
    expect(screen.queryByTestId('reattune-storm')).toBeNull(); // its own element now
  });

  it('Re-attune waits for the dive to end', () => {
    put(helm('frost'));
    store().setProfile({ ...store().profile, pair: { primary: 'fire', secondary: 'storm' } });
    store().startDive(1);
    render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    expect(screen.getByTestId('reattune-fire')).toBeDisabled();
    expect(screen.getByTestId('reattune-locked')).toHaveTextContent('between dives');
  });

  it('equipping gear outside the pair asks to bind it, with the Power either way; Bind binds, then equips', () => {
    put(helm('storm'));
    const onClose = vi.fn();
    render(<ItemDetailSheet uid="h1" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    const prompt = screen.getByTestId('bind-prompt');
    expect(prompt).toHaveAttribute('data-pad-scope');
    expect(prompt).toHaveTextContent('Bind Storm as your second element?');
    expect(screen.getByTestId('bind-prompt-bound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-unbound')).toHaveTextContent('Power');
    expect(screen.getByTestId('bind-prompt-not-now')).toHaveAttribute('data-pad-back');
    expect(screen.getByTestId('bind-prompt-confirm')).toHaveFocus();
    fireEvent.click(screen.getByTestId('bind-prompt-confirm'));
    expect(store().profile.pair).toEqual({ primary: 'fire', secondary: 'storm' });
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(onClose).toHaveBeenCalled();
  });

  it('Not now equips for its stats only, and the prompt stays away this session', () => {
    put(helm('storm'), helm('storm', 'h2'));
    const { unmount } = render(<ItemDetailSheet uid="h1" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    fireEvent.click(screen.getByTestId('bind-prompt-not-now'));
    expect(store().profile.pair.secondary).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    unmount();
    render(<ItemDetailSheet uid="h2" onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h2');
  });

  it('mid-dive such gear just equips, with a toast', () => {
    put(helm('storm'));
    store().startDive(1);
    render(
      <>
        <ItemDetailSheet uid="h1" onClose={() => {}} />
        <ToastContainer />
      </>,
    );
    fireEvent.click(screen.getByTestId('equip-button'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(screen.getByText('Bind Storm between dives to draw power from it')).toBeInTheDocument();
  });

  it('Equip best never asks', () => {
    put(helm('storm')); // an empty helm slot: an upgrade
    render(<BagPanel onSelect={() => {}} />);
    fireEvent.click(screen.getByTestId('equip-best'));
    expect(screen.queryByTestId('bind-prompt')).toBeNull();
    expect(store().profile.equipped.helm?.uid).toBe('h1');
    expect(store().profile.pair.secondary).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: FAIL (no greying, no Mana Dust on salvage, no Re-attune, no prompt; 'Equip best never asks' already passes).

- [ ] **Step 3: `BindPrompt.tsx`**

Create `src/features/delve/BindPrompt.tsx`:

```tsx
import { equipItem, profilePower, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { getDelveRegistry } from './registry';
import { formatNumber, manaStyle } from './format';

/**
 * Equipping gear outside the pair while no second element is bound (between
 * dives): bind its element and equip, or equip it for its stats only and not
 * be asked about that element again this session ("Not now" is remembered per
 * element: a "Not now" on Storm still asks about Nature). Shows the Power
 * either way. Bind has the focus, for the controller.
 */
export function BindPrompt({ item, onDone }: { item: GearItem; onDone: () => void }) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const st = manaStyle(registry, item.mana);
  const worn = equipItem(registry, profile, item.uid);
  const statsOnly = profilePower(registry, worn);
  const bound = profilePower(registry, { ...worn, pair: { ...worn.pair, secondary: item.mana } });

  const finish = (bind: boolean) => {
    const store = useDelveStore.getState();
    if (bind) store.bindSecondary(item.mana);
    else store.declineBind(item.mana);
    store.equip(item.uid);
    playSound('orbPlace');
    vibrate('medium');
    onDone();
  };

  return (
    <div
      className="delve-sheet-backdrop"
      style={{ alignItems: 'center' }}
      onClick={(e) => e.stopPropagation()}
      data-testid="bind-prompt"
      data-pad-scope
    >
      <div
        className="delve-panel m-4 flex max-w-sm flex-col gap-3 p-4"
        role="dialog"
        aria-label={`Bind ${st.name}`}
      >
        <div className="delve-display text-lg font-bold" style={{ color: st.color }}>
          {st.icon} Bind {st.name} as your second element?
        </div>
        <p className="text-sm text-stone-300">
          Your combo finisher will discharge {st.name}, your abilities can use it, and its gear will
          attune you. After that, only a Realign changes it.
        </p>
        <div className="flex text-center text-xs text-stone-400">
          <div className="flex-1" data-testid="bind-prompt-bound">
            Bound
            <div className="delve-display text-base font-bold text-green-300">
              {formatNumber(bound)} Power
            </div>
          </div>
          <div className="flex-1" data-testid="bind-prompt-unbound">
            Stats only
            <div className="delve-display text-base font-bold text-stone-200">
              {formatNumber(statsOnly)} Power
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="delve-btn delve-btn-gold"
            onClick={() => finish(true)}
            autoFocus
            data-testid="bind-prompt-confirm"
          >
            Bind
          </button>
          <button
            type="button"
            className="delve-btn"
            onClick={() => finish(false)}
            data-pad-back
            data-testid="bind-prompt-not-now"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `ItemDetailSheet.tsx`**

- The `@alloy/engine` import gains `attuneElement,`, `inPair,`, `isDiveActive,`, `pairElements,`, `salvageDust,`, `type HeroStatKey,`; add `import { showToast } from '@/components/Toast';` and `import { BindPrompt } from './BindPrompt';`.
- Above `export function ItemDetailSheet`, add:

  ```tsx
  /** Marks an attunement line of an element outside the pair: it grants nothing. */
  function NotMine() {
    return (
      <span className="ml-1.5 text-[10px] text-stone-500" data-testid="not-your-element">
        not your element
      </span>
    );
  }
  ```

- After `const [confirmSalvage, setConfirmSalvage] = useState(false);` add `const [binding, setBinding] = useState(false);`.
- After `const attack = …;` add:

  ```tsx
    const diving = isDiveActive(profile);
    const dust = salvageDust(registry, item, profile.pair);
    const ownMana = inPair(profile, item.mana);
    const notMine = (stat: HeroStatKey) => {
      const el = attuneElement(stat);
      return !!el && !inPair(profile, el);
    };
    const reattuneTo = pairElements(profile.pair).filter((m) => m !== item.mana);
    const reattuneCost = registry.getDelveBalance().pair.reattuneDust[item.rarity];
    // Gear outside the pair while no second element is bound: equipping it asks to bind (between dives).
    const unbound =
      !!profile.pair.primary && !profile.pair.secondary && item.mana !== profile.pair.primary;
  ```

- Replace `onEquip` with:

  ```tsx
    const onEquip = () => {
      if (unbound && !diving && !store().bindDeclined.includes(item.mana)) {
        setBinding(true);
        return;
      }
      store().equip(item.uid);
      if (unbound && diving) showToast(`Bind ${mana.name} between dives to draw power from it`);
      playSound('orbPlace');
      vibrate('medium');
      onClose();
    };
  ```

- `flashStats`: `statsRef.current?.animate(` becomes `statsRef.current?.animate?.(`. jsdom has no `Element.prototype.animate`, so a successful re-attune in the tests would throw there (an unhandled error) and never reach its `say(…)`.
- After `onReforge`, add:

  ```tsx
    const onReattune = (to: ManaType) => {
      const res = store().reattune(item.uid, to);
      if (res.ok) {
        playSound('combineMerge');
        vibrate('medium');
        flashStats();
        say(`Attuned to ${manaStyle(registry, to).name}`, true);
      } else {
        playSound('combineFail');
        say(res.reason ?? 'Cannot re-attune', false);
      }
    };
  ```

- The `item-mana` chip: its `style={{ background: \`${mana.color}22\`, color: mana.color }}` becomes

  ```tsx
                  style={
                    ownMana
                      ? { background: `${mana.color}22`, color: mana.color }
                      : { background: 'rgba(255,255,255,0.05)', color: '#78716c' }
                  }
  ```

  and after its `{mana.icon} {mana.name} +{itemAffinityAttunement(registry, item)}` add `{!ownMana && ' · not your element'}`.
- The implicit lines (lines 278–280 on disk):

  ```tsx
              <div key={`i${i}`} className="text-sm text-stone-300">
                {formatStat(registry, l.stat, l.value)}
              </div>
  ```

  become

  ```tsx
              <div
                key={`i${i}`}
                className="text-sm"
                style={{ color: notMine(l.stat) ? '#57534e' : '#d6d3d1' }}
              >
                {formatStat(registry, l.stat, l.value)}
                {notMine(l.stat) && <NotMine />}
              </div>
  ```

- The affix line's `<span style={{ color: '#93c5fd' }}>{formatStat(registry, l.stat, l.value)}</span>` becomes

  ```tsx
                    <span style={{ color: notMine(l.stat) ? '#57534e' : '#93c5fd' }}>
                      {formatStat(registry, l.stat, l.value)}
                      {notMine(l.stat) && <NotMine />}
                    </span>
  ```

- The salvage button's label `` `Salvage +${formatNumber(salvage)}` `` becomes `` `Salvage +${formatNumber(salvage)}${dust > 0 ? ` · ✦ ${dust}` : ''}` ``.
- Between the actions grid's closing `</div>` and the footer (`<div className="mt-3 text-center text-[11px] text-stone-500">`), add:

  ```tsx
          {reattuneTo.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5" data-testid="reattune">
              <div className="text-[11px] text-stone-400">
                Re-attune to your other element: its {mana.name} lines follow.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {reattuneTo.map((m) => {
                  const st = manaStyle(registry, m);
                  return (
                    <button
                      key={m}
                      type="button"
                      className="delve-chip"
                      disabled={diving}
                      style={diving ? { opacity: 0.35 } : undefined}
                      onClick={() => onReattune(m)}
                      data-testid={`reattune-${m}`}
                    >
                      {st.icon} {st.name} · ✦ {reattuneCost}
                    </button>
                  );
                })}
              </div>
              {diving && (
                <div className="text-[11px] text-amber-200" data-testid="reattune-locked">
                  Re-attune between dives.
                </div>
              )}
            </div>
          )}
  ```

- The footer's `⚙ {formatNumber(profile.scrap)} scrap` becomes `⚙ {formatNumber(profile.scrap)} scrap · ✦ {formatNumber(profile.manaDust)} Mana Dust`.
- After the `.delve-sheet` div's closing `</div>` (still inside the backdrop), add

  ```tsx
        {binding && !isEquipped && (
          <BindPrompt
            item={item}
            onDone={() => {
              setBinding(false);
              onClose();
            }}
          />
        )}
  ```

  (Closing the prompt in the same click as the equip keeps it from re-rendering an item that has left the bag.)

- [ ] **Step 5: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/__tests__/ItemDetailSheet.test.tsx)`
Expected: no type errors; PASS.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/BindPrompt.tsx packages/client/src/features/delve/ItemDetailSheet.tsx
git add packages/client/src/features/delve/BindPrompt.tsx packages/client/src/features/delve/ItemDetailSheet.tsx packages/client/src/features/delve/__tests__/ItemDetailSheet.test.tsx
git commit -m "feat(client): the item sheet greys off-pair attunement, re-attunes, and asks to bind"
```

---

## Chunk 6: Client: the blows, the Training Grounds, E2E, docs, v0.43.0

### Task 17: What each blow draws

**Files:**
- Modify: `packages/client/src/features/delve/arena/fx/infusion.ts` (`basicMotif`)
- Modify: `packages/client/src/features/delve/arena/fx/mana-fx.ts` (`finisherRing`)
- Modify: `packages/client/src/features/delve/arena/fx/draw-world.ts` (`shotInfusion`)
- Modify: `packages/client/src/features/delve/arena/fx/anticipation.ts` (`windingUp`)
- Modify: `packages/client/src/features/delve/arena/ArenaRenderer.ts` (the `basic` event)
- Test: `packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts`, `…/mana-fx.test.ts`, `…/anticipation.test.ts`

- [ ] **Step 1: Write the failing tests**

`arena/fx/__tests__/infusion.test.ts`: add `basicMotif,` to the `'../infusion'` import and append:

```ts
describe('basicMotif', () => {
  it("draws the weapon's infusion on a blow of another element, and none on a blow of that element", () => {
    expect(basicMotif({ infusion: 'storm' }, 'fire')).toBe('storm');
    expect(basicMotif({ infusion: 'storm' }, 'storm')).toBeNull(); // a finisher's discharge
    expect(basicMotif({ infusion: null }, 'fire')).toBeNull();
  });
});
```

`arena/fx/__tests__/mana-fx.test.ts`, `describe('finisherRing')`: replace the test 'draws none for a ranged finisher or a plain blow' with

```ts
  it('flares at the hand for a ranged finisher; none for a plain blow', () => {
    const flare = finisherRing({ ...blow, melee: false }, Math.PI / 2, 1.6)!;
    expect(flare).toMatchObject({ kind: 'ring', x: 2, r: 0.6 });
    expect(flare.y).toBeCloseTo(3 - 0.3 - HAND); // chest height, HAND toward the aim (up)
    expect(finisherRing({ ...blow, finisher: false }, Math.PI / 2, 1.6)).toBeNull();
    expect(finisherRing({ ...blow, melee: false, finisher: false }, Math.PI / 2, 1.6)).toBeNull();
  });
```

and in `describe('the infusion pass: persistent carriers')`, the test "gives a basic shot the weapon's infusion" becomes

```ts
  it("gives a basic shot the weapon's infusion, unless the shot is that element already", () => {
    const basic = shot({ form: null, ability: null, element: 'fire' });
    expect(used(world({ projectiles: [basic] }))).toBe(0);
    const infused = { ...plainHero, stats: { weapon: { infusion: 'nature' } } };
    expect(used(world({ projectiles: [basic], hero: infused }))).toBeGreaterThan(0);
    // A finisher's shot is the secondary's own body: no motif on top.
    expect(used(world({ projectiles: [{ ...basic, element: 'nature' }], hero: infused }))).toBe(0);
  });
```

`arena/fx/__tests__/anticipation.test.ts`: add `import { MANA_HEX } from '../../palette';` and append inside `describe('windingUp')`:

```ts
  it("a finisher winds up in the colour of the secondary it discharges", () => {
    const step = { time: 1, startup: 0.3, move: 0.4, power: 1, heft: 0.5 };
    const weapon = { combo: [step, { ...step, power: 1.7 }], element: 'fire', infusion: 'storm' };
    const swing = {
      step: 1,
      dir: { x: 1, y: 0 },
      targetId: null,
      start: 0.9,
      strikeAt: 1.1,
      committed: true,
    };
    const colour = (s: object, w: object) =>
      windingUp(world({ swing: s, stats: { weapon: w } } as never))!.color;
    expect(colour(swing, weapon)).toBe(MANA_HEX.storm);
    expect(colour({ ...swing, step: 0 }, weapon)).toBe(MANA_HEX.fire);
    expect(colour(swing, { ...weapon, infusion: null })).toBe(MANA_HEX.fire);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `(cd packages/client && npx vitest run src/features/delve/arena/fx/__tests__)`
Expected: FAIL (`basicMotif` is not exported; the ranged finisher returns null; the nature-bodied shot draws nature; the finisher winds up in fire).

- [ ] **Step 3: Implement**

`arena/fx/infusion.ts`, after `eventSeed`, add:

```ts
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

`arena/fx/mana-fx.ts`, `finisherRing`: its doc becomes

```ts
/**
 * Where a basic finisher discharges the secondary: a ring at the blade's tip
 * (`reach` out along `dir`, sized by heft), round the hero at `reach` for a
 * full-circle blow, or, for a shot (no tip), a flare at the hand (r 0.6).
 * `arc` is in radians.
 */
```

and its first line `if (!e.melee || !e.finisher) return null;` becomes

```ts
  if (!e.finisher) return null;
  if (!e.melee) {
    const hand = handPoint(e.x, e.y, e.dir);
    return { kind: 'ring', x: hand.x, y: hand.y, r: 0.6 };
  }
```

(`handPoint` is defined above it in the same file.) Two comments in `mana-fx.ts` follow suit: in the file's header comment,

```ts
 * (fx/infusion.ts): infused swings and beams, finisher discharges, blasts and
 * blink trails. Cosmetic only, so it may use Math.random.
```

becomes

```ts
 * (fx/infusion.ts): infused swings and beams, finisher discharges (at a
 * blade's tip, round a full circle, or a flare at a shooter's hand), blasts
 * and blink trails. Cosmetic only, so it may use Math.random.
```

and the start of `infuse`'s doc,

```ts
   * A transient infusion carrier: an infused melee finisher's discharge (a
   * ring, drawn at strength 1.5), an infused blast's rim (a ring that grows
```

becomes

```ts
   * A transient infusion carrier: a finisher's discharge (a ring at the blade's
   * tip, round a full circle, or a flare at the hand for a shot; drawn at
   * strength 1.5), an infused blast's rim (a ring that grows
```

`arena/fx/draw-world.ts`: the `'./infusion'` import gains `basicMotif`; `shotInfusion`'s doc becomes `/** A hero shot's infusion: its ability's second element, or for a basic shot the weapon's (none when the shot is that element: a finisher's discharge). Embers have none. */` and its return becomes `return p.ability ? (p.ability.elements[1] ?? null) : basicMotif(w.hero.stats.weapon, p.element);`.

`arena/fx/anticipation.ts`, the `if (h.swing?.committed) { … }` block becomes

```ts
  if (h.swing?.committed) {
    const wpn = h.stats.weapon;
    const s = wpn.combo[h.swing.step];
    const span = Math.max(1e-6, h.swing.strikeAt - h.swing.start);
    // A finisher winds up in the colour of the secondary it discharges.
    const element =
      h.swing.step === wpn.combo.length - 1 ? (wpn.infusion ?? wpn.element) : wpn.element;
    return {
      dir: h.swing.dir,
      heft: s?.heft ?? 0.3,
      progress: Math.min(1, Math.max(0, (w.t - h.swing.start) / span)),
      color: element ? MANA_HEX[element] : 0xd4a834,
    };
  }
```

`arena/ArenaRenderer.ts`: `import { INFUSION_BUDGET, type InfusionBudget } from './fx/infusion';` becomes `import { INFUSION_BUDGET, basicMotif, type InfusionBudget } from './fx/infusion';`, and the whole `case 'basic': { … }` becomes

```ts
        case 'basic': {
          this.kickCamera(e.dir, e.heft);
          const wpn = w.hero.stats.weapon;
          const s = wpn.combo[e.step] ?? wpn.combo[0];
          const arc = Math.min(360, s.arc ?? wpn.arc) * (Math.PI / 180);
          const range = wpn.range + (s.reach ?? 0) + 0.2;
          if (e.melee)
            this.fx.swing(e.x, e.y, Math.atan2(e.dir.y, e.dir.x), arc, range, elemColor(e.element), {
              heft: e.heft,
              reverse: e.step % 2 === 1,
              finisher: e.finisher,
              // Ordinary blows wear the secondary's motif; the finisher is its body.
              infusion: basicMotif(wpn, e.element),
            });
          else this.fx.fling(e.x, e.y, e.dir, elemColor(e.element), 6, 7);
          // The finisher discharges the secondary: at the tip, round a full circle, or at the hand.
          const ring = finisherRing(e, arc, range);
          if (ring && wpn.infusion) this.fx.infuse('finisher', wpn.infusion, ring);
          break;
        }
```

- [ ] **Step 4: Run to verify they pass**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts
git add packages/client/src/features/delve/arena/fx/infusion.ts packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/draw-world.ts packages/client/src/features/delve/arena/fx/anticipation.ts packages/client/src/features/delve/arena/ArenaRenderer.ts packages/client/src/features/delve/arena/fx/__tests__/infusion.test.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts packages/client/src/features/delve/arena/fx/__tests__/anticipation.test.ts
git commit -m "feat(client): blows wear the secondary's motif, finishers discharge it (at the hand for shots)"
```

---

### Task 18: The Training Grounds' pair

**Files:**
- Modify: `packages/client/src/features/delve/training/TrainingPanel.tsx` (`LoadoutTab`)
- Test: `packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/features/delve/__tests__/TrainingPanel.test.tsx`, replace the test 'the Basic infusion picker writes the store, disables the weapon element, and is off unarmed' with:

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
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `(cd packages/client && npx vitest run src/features/delve/__tests__/TrainingPanel.test.tsx)`
Expected: FAIL (no `sandbox-primary-*` chips).

- [ ] **Step 3: Implement**

In `LoadoutTab`, the comment above `const infusion = stats.weapon.infusion;` becomes `// What the engine discharges: none, or when the pick is the primary.`, and replace the whole `<Section title="Basic infusion"> … </Section>` with:

```tsx
      <Section title="Your primary">
        <div className="flex flex-wrap gap-1.5">
          {MANA_TYPES.map((m) => (
            <Chip
              key={m}
              pressed={s.primary === m}
              onClick={() => s.setPrimary(m)}
              testId={`sandbox-primary-${m}`}
            >
              {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-stone-500">Your primary: what your blows strike with.</p>
      </Section>

      <Section title="Basic infusion">
        <div className="flex flex-wrap gap-1.5">
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
              disabled={m === s.primary}
              onClick={() => s.setBasicInfusion(m)}
              testId={`basic-infusion-${m}`}
            >
              {manaStyle(registry, m).icon} {manaStyle(registry, m).name}
            </Chip>
          ))}
        </div>
        <p className="text-[11px] text-stone-500">Your combo finisher discharges this element.</p>
      </Section>
```

(The picker is open unarmed now: you punch with your primary. `choice` is still used by the weapon pickers above.)

- [ ] **Step 4: Run to verify it passes**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; all PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git add packages/client/src/features/delve/training/TrainingPanel.tsx packages/client/src/features/delve/__tests__/TrainingPanel.test.tsx
git commit -m "feat(client): the Training Grounds pick a primary, and the finisher discharges the infusion"
```

---

### Task 19: E2E: seed a pair, the Fire Ward, and the choice screen

**Files:**
- Modify: `packages/client/e2e/delve.spec.ts`, `packages/client/e2e/delve-gamepad.spec.ts`, `packages/client/e2e/delve-training.spec.ts`
- Create (scratch, never committed): `packages/client/playwright.scratch.config.ts` (see the header), `packages/client/e2e/affinity-shots.spec.ts`

- [ ] **Step 1: Update the specs**

`e2e/delve.spec.ts`:
- The engine import becomes `import { bindSecondary, createDefaultRegistry, createDelveProfile, type ManaType } from '@alloy/engine';`.
- `seedProfile` becomes:

  ```ts
  /** Seed a deterministic Delve save (a fire hero, and `secondary` bound if given) and let the engine bot play the arena. */
  async function seedProfile(
    page: Page,
    seed = 4242,
    autopilot = true,
    secondary?: ManaType,
  ): Promise<void> {
    let profile = createDelveProfile(createDefaultRegistry(), seed, { primary: 'fire' });
    if (secondary) profile = bindSecondary(profile, secondary).profile;
    const save = JSON.stringify(profile);
    await page.addInitScript(
      ([key, value, bot]) => {
        if (sessionStorage.getItem('delve-e2e')) return;
        localStorage.clear();
        localStorage.setItem(key, value);
        if (bot) localStorage.setItem('alloy:delve:autopilot', '1');
        localStorage.setItem('alloy:delve:timescale', '2');
        localStorage.setItem('alloy:muted', 'true');
        sessionStorage.setItem('delve-e2e', '1');
      },
      [SAVE_KEY, save, autopilot] as const,
    );
  }
  ```

- D01: `'Defensive: Frost Ward',` becomes `'Defensive: Fire Ward',`.
- D04: `await seedProfile(page);` becomes `await seedProfile(page, 4242, true, 'nature');` (a Wildfire Burst needs nature in the pair).
- Append inside the `describe`:

  ```ts
    test('D08: a new save chooses its mana first; Frost starts with frost gear and abilities', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        if (sessionStorage.getItem('delve-e2e')) return;
        localStorage.clear();
        localStorage.setItem('alloy:muted', 'true');
        sessionStorage.setItem('delve-e2e', '1');
      });
      await page.goto('/delve');
      const choice = page.getByTestId('mana-choice');
      await expect(choice).toBeVisible();
      await page.getByTestId('mana-choice-frost').click();
      await expect(choice).toBeHidden();
      await page.getByTestId('tab-abilities').click();
      const summary = page.getByTestId('abilities-summary');
      await expect(summary).toContainText('Frost Bolt');
      await expect(summary).toContainText('Frost Ward');
      await expect(summary).toContainText('Frost Nova');
      await page.getByTestId('slot-weapon').click();
      await expect(page.getByTestId('item-mana')).toContainText('Frost');
    });
  ```

`e2e/delve-gamepad.spec.ts` and `e2e/delve-training.spec.ts`: `createDelveProfile(createDefaultRegistry(), 4242)` becomes `createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' })` (a save with no pair would open on the choice screen).

- [ ] **Step 2: Run the E2E**

Create the scratch config (header) and make sure the 5288 dev server is up on the rebuilt engine (restart it with the header block; expect `True`).

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`
Expected: all pass on the four device projects. A consistent failure is a regression: read the page's console and the save (`localStorage['alloy:delve:v2']`), not longer timeouts.

- [ ] **Step 3: Look at the blows**

Create `packages/client/e2e/affinity-shots.spec.ts` (scratch: never committed):

```ts
import { test, expect, type Page } from '@playwright/test';
import { createDefaultRegistry, createDelveProfile, defaultAbilities } from '@alloy/engine';

/**
 * SCRATCH (elemental affinity plan, Task 19): never committed. The Training
 * Grounds with a pair, the engine bot fighting one dummy at half speed with
 * real cooldowns and mana (every cast cancels a swing, so the Ultimate on a
 * clump would hide the finishers); crops round the hero go to
 * test-results/affinity-shots/.
 */
const OUT = 'test-results/affinity-shots';
const SCENARIOS = [
  {
    name: 'sword-fire-storm',
    weapon: { baseId: 'sword', mana: 'fire', rarity: 'rare' },
    primary: 'fire',
    basicInfusion: 'storm',
  },
  {
    name: 'staff-frost-nature',
    weapon: { baseId: 'staff', mana: 'frost', rarity: 'rare' },
    primary: 'frost',
    basicInfusion: 'nature',
  },
] as const;

async function seed(page: Page, s: (typeof SCENARIOS)[number]): Promise<void> {
  const save = JSON.stringify(createDelveProfile(createDefaultRegistry(), 4242, { primary: 'fire' }));
  const sandbox = JSON.stringify({
    weapon: s.weapon,
    loadedWeapon: null,
    gear: {},
    legendaries: {},
    attunement: {},
    abilities: defaultAbilities(s.primary),
    depth: 5,
    dummyElement: null,
    dummies: [{ layout: 'single', element: null }],
    toggles: { infiniteMana: false, noCooldowns: false, invulnerable: true },
    slowmo: 0.5,
    primary: s.primary,
    basicInfusion: s.basicInfusion,
  });
  await page.addInitScript(
    ([delve, training]) => {
      if (sessionStorage.getItem('affinity-shots')) return;
      localStorage.clear();
      localStorage.setItem('alloy:delve:v2', delve);
      localStorage.setItem('alloy:delve:sandbox:v1', training);
      localStorage.setItem('alloy:delve:autopilot', '1');
      localStorage.setItem('alloy:muted', 'true');
      sessionStorage.setItem('affinity-shots', '1');
    },
    [save, sandbox] as const,
  );
}

for (const s of SCENARIOS)
  test(`affinity shots: ${s.name}`, async ({ page }) => {
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
    for (let n = 0; n < 40; n++) {
      await page.screenshot({ path: `${OUT}/${s.name}-${String(n).padStart(2, '0')}.png`, clip });
      await page.waitForTimeout(150);
    }
  });
```

Run: `(cd packages/client && npx playwright test -c playwright.scratch.config.ts --project desktop e2e/affinity-shots.spec.ts)`
Expected: 2 passed; 80 PNGs in `packages/client/test-results/affinity-shots/`.

View them with the Read tool and check:
- the sword's ordinary swings are fire-bodied with storm arcs, and its third blow is a storm-bodied sweep with a storm ring at the tip and no extra arcs on the sweep;
- the staff's ordinary shots are frost orbs with nature sprigs; its great orb is nature-bodied with no motif on it, its burst ring carries none either, and a nature flare shows at the hand on release;
- nothing draws twice.

If the hand flare is too small or too large to read, tune only its radius in `finisherRing` (`r: 0.6`) and the matching test, rerun the client tests and shoot again. Delete `e2e/affinity-shots.spec.ts` when done. If you tuned:

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts
git add packages/client/src/features/delve/arena/fx/mana-fx.ts packages/client/src/features/delve/arena/fx/__tests__/mana-fx.test.ts
git commit -m "fix(client): tune the ranged discharge flare from the screenshots"
```

- [ ] **Step 4: Commit the specs**

```bash
cd /c/Projects/Alloy
npx prettier --write packages/client/e2e/delve.spec.ts packages/client/e2e/delve-gamepad.spec.ts packages/client/e2e/delve-training.spec.ts
git add packages/client/e2e/delve.spec.ts packages/client/e2e/delve-gamepad.spec.ts packages/client/e2e/delve-training.spec.ts
git commit -m "test(client): the Delve E2E seeds a pair and covers the choice screen"
```

(Keep the scratch config for Task 20.)

---

### Task 20: Docs, version, full verification, push

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md` (status line), `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md` (line 108), `packages/client/package.json` (version)

- [ ] **Step 1: Docs and version**

In `CLAUDE.md`, the Delve section:

1. In the **Client** bullet, `schema version 3, validated with Zod on load; version 2 saves migrate).` becomes `schema version 4, validated with Zod on load; versions 2 and 3 migrate, and the builds a migration changes become a toast).`
2. In the **Mana-pixel FX** bullet, `basic attacks draw \`HeroWeapon.infusion\` (null until elemental affinity; the Training Grounds' Basic infusion previews it)` becomes `basic attacks draw \`HeroWeapon.infusion\`, the hero's bound secondary (ordinary blows wear its motif, \`basicMotif\`; the finisher is its body and discharges it: a ring at the tip, round a full circle, or a flare at the hand for a shot)`.
3. After the **Pacing guard rails** bullet, add:

```markdown
- **Elemental affinity** (spec: `docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md`): each hero has a pair, `profile.pair` (`{ primary, secondary }`; "affinity" already means an item's mana). A new save chooses its primary on the Anvil (`features/delve/ManaChoice.tsx` → `chooseStartingMana`: the equipped gear re-attunes to it and the builds reset); a second element is bound between dives, for free (`bindSecondary`: from the Mana view on the Abilities tab, `ManaPanel.tsx`, or the bind prompt when equipping off-pair gear, `BindPrompt.tsx`), and only `realign` (Mana Dust + scrap) changes the pair. Every op lives in the engine's `src/delve/pair.ts` and refuses while `isDiveActive` (but the choice). Attunement counts only for the pair: take a hero's real stats from `profileStats(registry, profile)` (`computeHeroStats` with `{ pair, filterAttunement: true }`), never plain `computeHeroStats`. Basic blows strike with the primary (even unarmed) and the combo's finisher discharges the secondary, always applying its status (`HeroWeapon.blowPower` / `finisherPower` grow with attunement); in the Delve, abilities use only the pair (`setAbility`, `fixBuildsToPair`), while the Training Grounds stay unrestricted with their own `primary` and a basics-only pair. A secondary above `overtakeMargin` × the primary's attunement swaps in when a dive closes (`resolveOvertake`, from the store's `closeDive` and the autopilot's `betweenDives`). Drops lean toward the pair (`rollMana`); salvaging off-pair gear gives Mana Dust (`salvageDust`), spent on Re-attune (`reattuneItem`, in the item sheet) and Realign. Numbers: `balance.json → delve.pair`. The store's `notices` queue becomes toasts on the Delve pages (`useDelveNotices`).
```

In the spec, `**Status:** Approved in conversation.` becomes `**Status:** Built in v0.43.0.`

In `docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md`, line 108 (**Finisher ring placement**) ends `Ranged finishers draw no extra ring: the shot's orb and any burst carry the infusion.`; append ` (Superseded by the elemental affinity spec: a ranged finisher now flares at the hand.)`.

In `packages/client/package.json`, `"version": "0.42.1"` becomes `"version": "0.43.0"`.

- [ ] **Step 2: Full verification**

Run, and check each is green before claiming anything:
- `(cd packages/engine && npx vitest run && npx tsc --noEmit -p .)` (the pacing gate included)
- `pnpm -F @alloy/engine build`
- `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
- restart the 5288 dev server (header block; `True`), then `(cd packages/client && npx playwright test -c playwright.scratch.config.ts e2e/delve.spec.ts e2e/delve-gamepad.spec.ts e2e/delve-training.spec.ts)`

Expected: all green. Then delete `packages/client/playwright.scratch.config.ts`, and leave the 5288 dev server running: the user plays on it.

- [ ] **Step 3: Commit and push**

```bash
cd /c/Projects/Alloy
git add CLAUDE.md docs/superpowers/specs/2026-09-27-delve-elemental-affinity-design.md docs/superpowers/specs/2026-09-27-delve-infusion-visuals-design.md packages/client/package.json
git commit -m "docs: elemental affinity in the Delve notes

chore(client): bump version to 0.43.0"
git push -q origin claude/alloy-loot-gear-system-6upsy5
```

`git status` must show nothing of this work left: only the three untracked 2026-05-01 plan docs (and any v0.42.1 files that were never this plan's).
