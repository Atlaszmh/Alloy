# Delve Runes, Wave 2D: Power, the Autopilot and the DPS Lab

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Socketed runes count where the hero is valued and where it is played by machine. Power (`delve/hero-stats.ts`) values every rune knob with the spec's constants. The autopilot fuses, opens sockets and sockets its best runes between dives, and takes a stop's `'rune'` power-up second. The arena bot fetches rune drops. The DPS Lab gains the rune axis: the engine's `dpsCombos` gets a `'rune'` view and `runeComboSetups` (the combo gate's sets), and the Lab page shows a **Runes** view with a "× none" ratio column. Wave 3 runs the gate; this area provides the means and their tests.

**Architecture:** Power reads the knobs each move resolved with (`ResolvedAbility.knobs`, `HeroBlow.knobs`), so a future rune that sets an existing knob is valued with no change here. `damagePerUse` gains the move terms (`reach`, `shots`, `boost`). `estimateCombat` gains the blows' terms (`blowRunes`, Quick on their time), Drain's mana, Guard's barrier and Leech's sustain. Every term is exactly 1 (a factor) or 0 (a sum) without runes, so a hero without runes keeps its Power bit for bit. The autopilot's policy is four small functions over the contract's ops (`fuseRunes`, `openSocket`, `setChain`, `takeStop`), with no new rules of its own. The Lab's rune rows carry their baseline's key (`DpsSetup.base`), so the page computes ratios without naming a dimension.

**Tech Stack:** TypeScript 5.7, Vitest 3 (engine: Node; client: jsdom with Testing Library), React 19.

**Spec:** `docs/superpowers/specs/2026-09-30-delve-runes-design.md` at `81b0e31`: "Power and the autopilot", "Balance and gates", and "Build waves → Wave 2 → D". Read the overview `00-overview.md` first: its shared conventions apply here.

---

## Base

- **Starts from:** the controller's merge of waves 0 and 1 (A: sim, B: economy, C: client components), on the branch `runes/power-lab` in the worktree `C:\Projects\alloy-power-lab`.
- **Needs merged first:** wave 0 (types, data, `NEUTRAL`, `moveBeat` in `useInterval`, `loot/runes.ts` helpers, the B stubs) and wave 1 A and B (the knob handlers and the economy ops this area calls). Wave 1 C isn't used.
- **Parallel with:** wave 2 E (client wiring) and F (arena). Neither touches a file here.

**Worktree** (the overview's rule; skip it if the controller already made `C:\Projects\alloy-power-lab`). PowerShell; `<wave-1 merge>` is the commit the controller names. The client's `@alloy/engine` points at the worktree's own engine, so the client tests the worktree's bundle:

```powershell
git -C C:\Projects\Alloy worktree add ..\alloy-power-lab -b runes/power-lab <wave-1 merge>
$W = 'C:\Projects\alloy-power-lab'; $R = 'C:\Projects\Alloy'
cmd /c mklink /J "$W\node_modules" "$R\node_modules"
cmd /c mklink /J "$W\packages\engine\node_modules" "$R\packages\engine\node_modules"
New-Item -ItemType Directory -Force "$W\packages\client\node_modules\@alloy" | Out-Null
Get-ChildItem -Force "$R\packages\client\node_modules" | Where-Object Name -ne '@alloy' | ForEach-Object { cmd /c mklink /J "$W\packages\client\node_modules\$($_.Name)" $_.FullName }
cmd /c mklink /J "$W\packages\client\node_modules\@alloy\engine" "$W\packages\engine"
```

(From Git Bash, `cmd //c mklink /J` mangles the switch: use PowerShell for the links. Remove them with `cmd /c rmdir`, never by deleting through them.) Run every command below from `C:/Projects/alloy-power-lab`.

**Scratchpad** (in Bash; Node takes the `C:/` form): `S=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad`. Wave 0's "before" files are in `$S/runes-before`. This area writes its "after" files to `$S/runes-d`.

## Files

| File | Change | Responsibility |
|---|---|---|
| `packages/engine/src/arpg/dps-sim.ts` | modify | The rune view in `dpsCombos` (`runeRows`, `runeSetup`), `DpsSetup.base`, `runeComboSetups` |
| `packages/engine/tests/delve-dps-sim.test.ts` | modify | The rune view's rows and the combo setups |
| `packages/engine/src/index.ts` | modify (see Cross-area needs) | Re-export `runeComboSetups` for wave 3's gate script |
| `packages/engine/src/delve/hero-stats.ts` | modify | Power's rune terms in `damagePerUse` and `estimateCombat` |
| `packages/engine/tests/delve-rune-power.test.ts` | create | Power without runes (goldens), Power against the Lab, the autopilot's policy, the bot's pickups |
| `packages/engine/src/delve/autopilot.ts` | modify (CRLF, never format) | Fuse, open sockets, socket by Power; the stop's `'rune'` second |
| `packages/engine/src/arpg/bot.ts` | modify (see Cross-area needs) | The bot detours for a rune as for an item |
| `packages/client/src/features/delve/lab/lab-model.ts` | modify | `baseRatios`, `formatRatio` |
| `packages/client/src/features/delve/lab/LabTable.tsx` | modify | The optional "× none" column |
| `packages/client/src/pages/DelveLab.tsx` | modify | The **Runes** view and its ratios |
| `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts` | modify | `baseRatios`, `formatRatio` |
| `packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx` | modify | The ratio column |
| `packages/client/src/pages/__tests__/DelveLab.test.tsx` | modify | The Runes tab |

Line endings: `autopilot.ts` is CRLF (keep it, and never run Prettier on it); every other file here is LF. Prettier: every other file here passed `npx prettier --check` at `81b0e31`, and wave 0 and 1 leave them formatted, so the commit blocks format the files each task touches (never `autopilot.ts`).

## Cross-area needs

1. **`packages/engine/src/arpg/bot.ts`** (Task 3). The spec's wave-2 D line names "`bot.ts`'s rune pickups", but the overview's Owns column for D leaves it out: it sat under wave 1 A's `src/arpg/**`. No wave-2 area touches it. **Ask:** add `src/arpg/bot.ts` to D's Owns. Task 3 is written for that. The whole change is one line:

   In `packages/engine/src/arpg/bot.ts`, replace `      (d) => !d.dead && d.kind === 'item' && dist(h.x, h.y, d.x, d.y) < 6,` with `      (d) => !d.dead && (d.kind === 'item' || d.kind === 'rune') && dist(h.x, h.y, d.x, d.y) < 6,`

   If wave 1 already made it (Task 3, Step 0 checks), skip Task 3.
2. **`packages/engine/src/index.ts`** (Task 1). Wave 0 owns it, and no wave-2 area edits it. Wave 3's gate script (`08-wave3-gate-e2e-docs.md`, `rune-gate.mjs`) calls `runeComboSetups` from the built engine, so it must be re-exported. The spec's wave-0 export list doesn't name it, and wave 0 can't export it without a stub in `dps-sim.ts`, which is D's file. **Ask:** let D make the edit, in Task 1, Step 3: replace `export { simulateDps, dpsCombos, dpsKey, DPS_SECONDS, DPS_SAMPLE } from './arpg/dps-sim.js';` with the same export plus `runeComboSetups` after `dpsKey`. Prettier lays it out one name a line. The Lab page needs no other export: it finds each row's baseline through `DpsSetup.base`, which the existing `DpsSetup` type export carries.

## What this area assumes of waves 0 and 1

This area builds on these, exactly as the spec's contract and wave-1 lines assign them:
- **Wave 0:** `Knobs`' new fields (`pierce` a count, `NEUTRAL.pierce` 0; `split`, `extraShots`, `echo`, `quick`, `stacksBonus`, `catalyst`, `manaOnHit`, `guardOnLand`); `ResolvedAbility.runes`; `HeroBlow.knobs` (the blow's active runes merged, `NEUTRAL` without) and `HeroBlow.runes`; `bal.runes` (`fuseCount`, `drainFoes`, `guardSeconds`, …); `registry.getRunes()` / `getRune()`; `loot/runes.ts`'s `runeFits`, `socketCap`, `socketsOf`, `pouchCount`; `RUNE_TIERS`, `RuneRef`, `RuneTier`, `RuneTarget`, `RuneDef`; `profile.runes`; `useInterval`'s cadence already on `moveBeat`. Rune ids are the names in lower case, Multi-shot's `multishot` (wave 0's `runes.json`).
- **Wave 1 A:** `resolveAbility` merges a move's active runes after the legendaries. `ResolvedAbility.power` takes every trade-off and Multi-shot's per-shot cut (half on Volley, none on Barrage). `count` takes Volley's and Barrage's extra shots, and `cooldown`, `conjure`, `channel` and `castTime` take `quick`. `computeHeroStats` sets each blow's `knobs` and `runes`, and **`HeroBlow.power` stays the feel row's**: the sim applies a blow's power knob and Multi-shot's cut where the blow lands. Task 2's third test pins all three: a blow's row power, a Volley's count and a Bolt's cut. Power multiplies a blow's `knobs.power` and cut itself, so if A folded them into `power` instead, that test fails: stop and report it (Power would count Heavy twice).
- **Wave 1 B:** `fuseRunes(registry, profile, ref)` and `openSocket(registry, profile, skill, index)` behave as the contract says (results, not throws; refused when short). `setChain` / `setChains` take a rune change with positional origins, and pull by the balance's mode. `takeStop` takes `{ kind: 'rune', skill, index, socket, rune }`. `movesetTransfer(...).moveset` holds no rune that leaves by the parts rule. Rune drops bank into `profile.runes`.

## Where the spec left room

- **What "Power change within ±25% of the Lab ratio" compares.** Power is `√(dps × ehp)`, so its own change is about half a DPS ratio. The test compares like with like: Power's modelled DPS of the held button (`estimateCombat`'s DPS with only that skill, minus the basics alone; for a weapon row, the basics alone) with and without the rune, against the Lab row's DPS over its baseline's. "The sign" is the direction with a 5% dead band: a miss is a ratio up past 1.05 against one down past 0.95, or a size more than 25% off.
- **The yardstick (a resolved contradiction).** The spec says the single-dummy ratio is Power's yardstick because "Power models one target". It doesn't: `damagePerUse` counts `TARGETS` foes (a Bolt 1.6, a Nova 3.5). Some runes are worth something only on other foes. On one dummy, Split's shards skip the foe hit, a Pierce or a Chain needs a second foe, Widen reaches more foes, and a Lance's fan shares one hit set. Their single-dummy ratio is at most 1 by construction, while Power, by the spec's own constants, raises them. So the test measures **Split, Pierce, Chain, Widen and Multi-shot on a Lance on the pack**, and every other rune on one dummy. The rule is one function in the test (`onThePack`), so it is one line to change.
- **Blows get every damage term.** The spec lists "power, area on melee cleave, extra shots, split, echo, quick on the time" for blows. Chain, Pierce, Linger, Volatile and Saturate fit blows too, so leaving them out would value those runes at nothing on a blow, and the autopilot would never socket them there. `blowRunes` uses the abilities' `reach` and `boost`, so the two rules can't drift.
- **Drain.** Its foe-hits per use are foes × impacts (a Barrage's 7, a Maelstrom's ticks), capped at `drainFoes`. The spec's `min(targets, 5)` undercounts what the cap counts ("every hit on a foe counts one"). Drain's mana raises the income the intervals use, which in turn depends on that income. One pass settles it: each skill's drain is taken over its interval at the income before Drain.
- **Guard.** "interval" is the time between that move's landings: the chain's per-use interval × its length (each move recurs once per loop), and the blows' strike interval × their count. Guard never stacks (a fresh barrier replaces a smaller one), so the largest source counts.
- **Leech** counts only the runes' lifesteal (from `ResolvedAbility.runes`). An element's own lifesteal knob (Shadow's 8%) was never in Power, and counting it now would change every Shadow hero's Power without a rune.
- **A transfer and the runes it would destroy: no new code.** `compareItem`'s home value moves the moveset with `movesetTransfer`, whose result holds no rune that leaves. So the after-Power already lacks those runes, and "a transfer is taken only when its Power gain beats the Power those runes give now" is exactly `powerPct > 0`, the rule `transferBest` already uses. Task 4 pins it with a test. In `pay` mode the autopilot still counts them lost, which is conservative: pay mode is a test toggle, and the autopilot plays at the balance's mode (noted, not built).
- **The autopilot's details.** Fusing stops at the first refusal (short of scrap, every later fuse costs as much or more). Opening picks the move with the fewest open sockets (the cheapest, since price rises with the index), first in `SLOT_ORDER` on a tie, below the weapon's cap, until refused. Socketing tries each pouch id's highest tier (every rune's tiers only improve). A filled socket changes only for a strict Power gain, and only to a different id or a higher tier of its own. The stop's rune is taken only when it raises Power. Otherwise the stop falls through to upgrade and slot, as before.
- **The Lab's baselines.** A baseline row's `dims` are `{ rune: 'none', on, elements, tier: 'none' }`. A rune row's `base` is its baseline's `dpsKey` (`rune|none|bolt|fire|none`), so the page never names a dimension. Which runes run on Fire + Frost is read from the data: a rune whose tiers set `catalyst` or `stacksBonus` (today Volatile and Saturate), so a future reaction rune is tested on a reacting pair too.
- **`runeComboSetups(registry, on)`** takes an attack form or a weapon base id (the rune view's `on`). Its sets follow `runes.json` order. Each setup is a rune-view setup with three runes, measured against its rune view `base`.

## Commands

The overview's (from the 4a plan's "Commands"), run from the worktree root. This area uses: one engine test file `(cd packages/engine && npx vitest run tests/<file>.test.ts)`; all engine tests `(cd packages/engine && npx vitest run)`; engine typecheck `(cd packages/engine && npx tsc --noEmit -p .)`; engine build `(cd packages/engine && pnpm build)`; client tests `(cd packages/client && npx vitest run [paths])`; client typecheck `(cd packages/client && npx tsc --noEmit -p .)`; client build `(pnpm -F @alloy/client build)`.

---

## Chunk 1: Engine: the Lab's rune view, and Power

### Task 1: The DPS Lab's rune view and the combo gate's setups

The grid gains a `'rune'` view: a baseline (`rune: 'none'`) for each of the 8 attack forms and 7 weapons on Fire and on Fire + Frost (30 rows). Then each rune at tier III goes on every attack form and weapon it fits: on the form's default chain, paid with mana, every move holding it; on the weapon's default basic chain, every blow holding it. That is 170 rows, Volatile and Saturate on Fire + Frost. Each rune row carries its baseline's key (`base`). `runeComboSetups(registry, on)` builds the combo gate's sets (not in the grid). The old rows are untouched.

**Files:**
- Modify: `packages/engine/src/arpg/dps-sim.ts`
- Modify: `packages/engine/src/index.ts` (one line; see Cross-area needs)
- Modify: `packages/engine/tests/delve-dps-sim.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-dps-sim.test.ts`:

Replace:

```ts
import {
  DPS_SECONDS,
  dpsCombos,
  dpsKey,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
```

with:

```ts
import {
  DPS_SECONDS,
  dpsCombos,
  dpsKey,
  runeComboSetups,
  simulateDps,
  type DpsOptions,
  type DpsSetup,
} from '../src/arpg/dps-sim.js';
```

Replace:

```ts
import { computeHeroStats } from '../src/delve/hero-stats.js';
```

with:

```ts
import { computeHeroStats } from '../src/delve/hero-stats.js';
import { runeFits } from '../src/loot/runes.js';
```

Append at the end of the file:

```ts
describe('the rune view (see the runes spec)', () => {
  const runeRows = grid.filter((s) => s.view === 'rune');
  const socketed = runeRows.filter((s) => s.dims.rune !== 'none');
  const echo = [{ id: 'echo', tier: 3 }];

  it('170 rune rows, each rune on every attack form and weapon it fits, and 30 baselines', () => {
    expect(socketed).toHaveLength(170);
    expect(runeRows.filter((s) => s.dims.rune === 'none')).toHaveLength(30);
    expect(socketed.filter((s) => s.dims.rune === 'split').map((s) => s.dims.on)).toEqual([
      'bolt',
      'volley',
      'barrage',
      'wand',
      'bow',
    ]);
    // Each row's baseline: the same form or weapon and elements, with no rune.
    for (const s of socketed)
      expect(byKey.get(s.base!)?.dims).toEqual({ ...s.dims, rune: 'none', tier: 'none' });
    expect(grid.filter((s) => s.view !== 'rune').every((s) => s.base === undefined)).toBe(true);
  });

  it("a form's row: its default chain paid with mana, every move holding the rune at tier III", () => {
    expect(setup('rune|echo|bolt|fire|III')).toEqual({
      view: 'rune',
      dims: { rune: 'echo', on: 'bolt', elements: 'fire', tier: 'III' },
      base: 'rune|none|bolt|fire|none',
      weapon: { baseId: 'sword', primary: 'fire', secondary: null },
      chains: {
        ...defaultChains(registry, 'fire', 'sword'),
        basic: defaultBasic(registry, 'sword', 'fire'),
        primary: {
          moves: ['light', 'medium', 'medium', 'heavy'].map((kind) => ({
            kind,
            form: 'bolt',
            elements: ['fire'],
            runes: echo,
          })),
          payment: 'mana',
        },
      },
      hold: { slot: 0 },
    });
    // An Ultimate form's row holds the Ultimate; Volatile runs on Fire + Frost.
    expect(setup('rune|volatile|nova|fire+frost|III')).toMatchObject({
      base: 'rune|none|nova|fire+frost|none',
      weapon: { baseId: 'sword', primary: 'fire', secondary: 'frost' },
      chains: {
        ultimate: {
          moves: [
            {
              kind: 'medium',
              form: 'nova',
              elements: ['fire', 'frost'],
              runes: [{ id: 'volatile', tier: 3 }],
            },
          ],
          payment: 'mana',
        },
      },
      hold: { slot: 2 },
    });
  });

  it("a weapon's row: its default basic chain, every blow holding the rune; only Volatile and Saturate run on Fire + Frost", () => {
    const s = setup('rune|saturate|bow|fire+frost|III');
    expect(s).toMatchObject({
      base: 'rune|none|bow|fire+frost|none',
      weapon: { baseId: 'bow', primary: 'fire', secondary: 'frost' },
      hold: 'attack',
    });
    expect(s.chains.basic).toEqual(
      defaultBasic(registry, 'bow', 'fire', 'frost').map((b) => ({
        ...b,
        runes: [{ id: 'saturate', tier: 3 }],
      })),
    );
    expect(s.chains.primary).toEqual(defaultChains(registry, 'fire', 'bow').primary);
    const frost = socketed.filter((x) => x.dims.elements === 'fire+frost');
    expect([...new Set(frost.map((x) => x.dims.rune))]).toEqual(['saturate', 'volatile']);
  });

  it("a baseline plays as the ability view's default chain", () => {
    expect(simulateDps(registry, setup('rune|none|bolt|fire|none'), ONE)).toEqual(
      simulateDps(registry, setup('ability|bolt|fire|none|default|mana'), ONE),
    );
  });

  it('a rune changes what the held button deals: Echo III on a Bolt beats its baseline', () => {
    const dps = (key: string) => simulateDps(registry, setup(key), ONE).dps;
    expect(dps('rune|echo|bolt|fire|III')).toBeGreaterThan(dps('rune|none|bolt|fire|none') * 1.2);
  });
});

describe('runeComboSetups', () => {
  it("every set of three runes that fit a form or a weapon's blows, at tier III on every move, against its baseline", () => {
    const bolt = runeComboSetups(registry, 'bolt');
    expect(bolt).toHaveLength(286); // 13 runes fit a Bolt
    expect(runeComboSetups(registry, 'sword')).toHaveLength(165); // 11 fit a sword's blows
    expect(new Set(bolt.map(dpsKey)).size).toBe(286);
    const [a, b, c] = registry
      .getRunes()
      .filter((def) => runeFits(def, { form: 'bolt' }))
      .map((def) => def.id);
    expect(bolt[0].dims).toEqual({
      rune: `${a}+${b}+${c}`,
      on: 'bolt',
      elements: 'fire',
      tier: 'III',
    });
    for (const m of bolt[0].chains.primary.moves)
      expect(m.runes).toEqual([a, b, c].map((id) => ({ id, tier: 3 })));
    // A set holding Volatile or Saturate runs on Fire + Frost, against that baseline.
    for (const s of bolt) {
      const reacts = /volatile|saturate/.test(s.dims.rune);
      expect(s.dims.elements).toBe(reacts ? 'fire+frost' : 'fire');
      expect(byKey.get(s.base!)?.dims).toEqual({ ...s.dims, rune: 'none', tier: 'none' });
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: FAIL, 6 failed and 17 passed (23). The count test: `expected [] to have a length of 170 but got +0`. The four row tests: `Error: No combo rune|echo|bolt|fire|III` (or the row each one looks up first). The combos test: `TypeError: runeComboSetups is not a function`.

- [ ] **Step 3: The rune view**

In `packages/engine/src/arpg/dps-sim.ts`:

Replace:

```ts
import { stepWorld } from './step.js';
```

with:

```ts
import { stepWorld } from './step.js';
import { runeFits } from '../loot/runes.js';
import type { RuneDef, RuneTier } from '../types/rune.js';
```

Replace:

```ts
export interface DpsSetup {
  view: 'basic' | 'ability';
  /**
   * Filterable dimensions in display order, e.g. { weapon, primary, secondary } or
   * { form, first, second, kind, payment } (a kind, or 'default' for the form's default
   * chain). Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
```

with:

```ts
export interface DpsSetup {
  view: 'basic' | 'ability' | 'rune';
  /**
   * Filterable dimensions in display order, e.g. { weapon, primary, secondary },
   * { form, first, second, kind, payment } (a kind, or 'default' for the form's default
   * chain) or { rune, on, elements, tier } (a rune's id, 'a+b+c' for a set, 'none' for the
   * baseline; an attack form or a weapon; 'fire' or 'fire+frost'; 'III', 'none' for the
   * baseline). Values are short ids; a missing element is 'none'.
   */
  dims: Record<string, string>;
  /** The `dpsKey` of the row it is measured against: a rune row's baseline (no rune). */
  base?: string;
```

Replace:

```ts
 * its default basics. The only function here that knows the chain model.
```

with:

```ts
 * its default basics. Then the rune view (`runeRows`). With `runeSetup`, the
 * only code here that knows the chain model.
```

Replace:

```ts
  return out;
```

with:

```ts
  out.push(...runeRows(registry));
  return out;
```

Append at the end of the file:

```ts
/** The rune view's tier (see the runes spec's gate). */
const RUNE_TIER: RuneTier = 3;
const FIRE: ManaType[] = ['fire'];
const FIRE_FROST: ManaType[] = ['fire', 'frost'];

/** The Primary's and the Ultimate's forms: what a held ability button attacks with. */
function attackForms(registry: DataRegistry) {
  return registry.getArpgData().forms.filter((f) => f.slot !== 'defensive');
}

/** Whether `def` fits `on`: an attack form, or a weapon's blows (the fit ignores a blow's kind). */
function fitsOn(registry: DataRegistry, def: RuneDef, on: string): boolean {
  const form = attackForms(registry).find((f) => f.id === on);
  return runeFits(def, form ? { form: form.id } : { weapon: on, kind: 'medium' });
}

/**
 * The elements a set of runes runs on: Fire + Frost when one of them feeds
 * reactions (its knobs set `catalyst` or `stacksBonus`: Volatile, Saturate), so
 * Melt fires and its gate can fail; else Fire.
 */
function runeElements(registry: DataRegistry, ids: readonly string[]): ManaType[] {
  const reacts = ids.some((id) =>
    registry.getRune(id).tiers.some((t) => t.catalyst !== undefined || t.stacksBonus !== undefined),
  );
  return reacts ? FIRE_FROST : FIRE;
}

/**
 * A rune-view setup: runes `ids` at tier III in every move of form `on`'s
 * default chain (paid with mana, on a sword), or in every blow of weapon
 * `on`'s default basic chain, on `elements` (Frost the pair's secondary). No
 * ids is the baseline that every such setup is measured against (`base`).
 */
function runeSetup(
  registry: DataRegistry,
  on: string,
  ids: readonly string[],
  elements: ManaType[],
): DpsSetup {
  const runes = ids.map((id) => ({ id, tier: RUNE_TIER }));
  const [first, second = null] = elements;
  const form = attackForms(registry).find((f) => f.id === on);
  const baseId = form ? 'sword' : on;
  const chains: Chains = {
    ...defaultChains(registry, first, baseId),
    basic: defaultBasic(registry, baseId, first, second),
  };
  if (form)
    chains[form.slot] = {
      moves: form.defaultChain.map((kind) => ({
        kind,
        form: form.id,
        elements: [...elements],
        runes: [...runes],
      })),
      payment: 'mana',
    };
  else chains.basic = chains.basic.map((b) => ({ ...b, runes: [...runes] }));
  const socketed = ids.length > 0;
  return {
    view: 'rune',
    dims: {
      rune: socketed ? ids.join('+') : 'none',
      on,
      elements: elements.join('+'),
      tier: socketed ? 'III' : 'none',
    },
    ...(socketed ? { base: dpsKey(runeSetup(registry, on, [], elements)) } : {}),
    weapon: { baseId, primary: first, secondary: second },
    chains,
    hold: form ? { slot: ABILITY_SLOTS.indexOf(form.slot) } : 'attack',
  };
}

/**
 * The rune view: a baseline per attack form and weapon on Fire and on Fire +
 * Frost, then each rune at tier III on every attack form and weapon it fits,
 * on its elements (`runeElements`).
 */
function runeRows(registry: DataRegistry): DpsSetup[] {
  const ons = [
    ...attackForms(registry).map((f) => f.id),
    ...registry.getGearBasesForSlot('weapon').map((b) => b.id),
  ];
  return [
    ...[FIRE, FIRE_FROST].flatMap((elements) =>
      ons.map((on) => runeSetup(registry, on, [], elements)),
    ),
    ...registry
      .getRunes()
      .flatMap((def) =>
        ons
          .filter((on) => fitsOn(registry, def, on))
          .map((on) => runeSetup(registry, on, [def.id], runeElements(registry, [def.id]))),
      ),
  ];
}

/**
 * The combo gate's setups (see the runes spec; wave 3 runs them): every set of
 * three runes that fit attack form or weapon `on`, in `runes.json` order, at
 * tier III on every move or blow, on Fire + Frost when the set feeds
 * reactions, else Fire, each measured against its `base` in the rune view.
 * Not in the grid: up to 286 a form.
 */
export function runeComboSetups(registry: DataRegistry, on: string): DpsSetup[] {
  const fit = registry
    .getRunes()
    .filter((def) => fitsOn(registry, def, on))
    .map((def) => def.id);
  return fit.flatMap((a, i) =>
    fit
      .slice(i + 1)
      .flatMap((b, j) =>
        fit
          .slice(i + j + 2)
          .map((c) => runeSetup(registry, on, [a, b, c], runeElements(registry, [a, b, c]))),
      ),
  );
}
```

In `packages/engine/src/index.ts` (the routed line; see Cross-area needs):

Replace:

```ts
export { simulateDps, dpsCombos, dpsKey, DPS_SECONDS, DPS_SAMPLE } from './arpg/dps-sim.js';
```

with:

```ts
export {
  simulateDps,
  dpsCombos,
  dpsKey,
  runeComboSetups,
  DPS_SECONDS,
  DPS_SAMPLE,
} from './arpg/dps-sim.js';
```

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-dps-sim.test.ts)`
Expected: PASS, 23 tests. The existing grid tests (252 basic, 3,456 one-move, 864 default chains, every key unique) still pass. They filter by view, and the rune keys start with `rune|`.

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors. Every test passes, 6 more than at the base. The pacing rails are unchanged (nothing outside the Lab reads `dpsCombos`).

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-power-lab
(cd packages/engine && npx prettier --write src/arpg/dps-sim.ts src/index.ts tests/delve-dps-sim.test.ts)
git add packages/engine/src/arpg/dps-sim.ts packages/engine/src/index.ts packages/engine/tests/delve-dps-sim.test.ts
git commit -m "feat(engine): the DPS Lab sweeps runes: a rune view at tier III and the combo gate's setups" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Power values socketed runes

`damagePerUse` counts each move's runes through its knobs:
- a Bolt's or Lance's fan, × (1 + 0.5 × extra shots); a Volley's added darts, × count ÷ (count − extra);
- a finite pierce, + 0.25 × min(pierce, 3) foes;
- Split's shards, + 0.5 × count × power per impact;
- Echo, × (1 + echo);
- Volatile, × (1 + 0.2 × catalyst);
- Saturate, × (1 + 0.05 × stacks).

`estimateCombat` gives each blow the same terms (`blowRunes`), plus its power knob, Multi-shot's per-shot power, and Widen on a melee cleave. Quick and Heavy scale each blow's time. Drain adds mana income, Guard adds barrier life, and Leech adds sustain.

A hero without runes keeps its Power to the last bit: every term is an exact × 1 or + 0. Test 1 pins v0.50.0's numbers, measured at `81b0e31`.

**Files:**
- Modify: `packages/engine/src/delve/hero-stats.ts`
- Create: `packages/engine/tests/delve-rune-power.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/delve-rune-power.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveAbility } from '../src/arpg/abilities/resolve.js';
import { dpsCombos, dpsKey, simulateDps, type DpsSetup } from '../src/arpg/dps-sim.js';
import { sandboxWeapon } from '../src/arpg/sandbox.js';
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { bindSecondary, profileStats } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { SeededRNG } from '../src/rng/seeded-rng.js';
import { ABILITY_SLOTS, type Chains } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import type { RuneRef } from '../src/types/rune.js';
import { chainsOf, gear, registry, withChains } from './fixtures/arena.js';

/**
 * Power and runes (see the runes spec's "Power and the autopilot"): Power is
 * unchanged without them, and values each one as the DPS Lab measures it.
 */

const DEPTH = 10;
const III = (id: string): RuneRef => ({ id, tier: 3 });

/** A profile's estimate, as `heroPower` makes it: its pair's stats and its weapon's chains. */
function estimate(p: DelveProfile, depth: number) {
  return estimateCombat(profileStats(registry, p), registry, depth, chainsOf(p));
}

describe('Power without runes', () => {
  /** A Storm hero, Earth bound, wielding an epic bow. */
  const archer = (): DelveProfile => {
    const bow = generateItem(
      registry,
      { uid: 'b', ilvl: 12, rarity: 'epic', slot: 'weapon', baseId: 'bow', mana: 'storm' },
      new SeededRNG(7),
    );
    const p = createDelveProfile(registry, 5, { primary: 'storm' });
    return bindSecondary(registry, { ...p, equipped: { ...p.equipped, weapon: bow } }, 'earth')
      .profile;
  };

  it("is what it was at v0.50.0: the starters (an Earth Bolt's endless pierce included) and an archer", () => {
    const starter = (primary: ManaType) =>
      estimate(createDelveProfile(registry, 3, { primary }), DEPTH);
    expect(starter('fire')).toEqual({
      dps: 36.424338129677416,
      ehp: 162.01086642686363,
      power: 768,
    });
    expect(starter('earth')).toEqual({
      dps: 34.21053596129032,
      ehp: 162.01086642686363,
      power: 744,
    });
    expect(starter('storm')).toEqual({
      dps: 40.66745895241935,
      ehp: 162.01086642686363,
      power: 812,
    });
    expect(starter('shadow')).toEqual({
      dps: 34.21053596129032,
      ehp: 162.01086642686363,
      power: 744,
    });
    expect(estimate(archer(), 15)).toEqual({
      dps: 336.61787210212225,
      ehp: 198.09056273093927,
      power: 2582,
    });
  });

  it('open sockets with nothing in them change nothing', () => {
    const p = archer();
    const open = Object.fromEntries(
      Object.entries(chainsOf(p)).map(([skill, c]) => [
        skill,
        Array.isArray(c)
          ? c.map((b) => ({ ...b, runes: [null] }))
          : { ...c!, moves: c!.moves.map((m) => ({ ...m, runes: [null, null, null] })) },
      ]),
    );
    expect(estimate(withChains(p, open), 15)).toEqual(estimate(p, 15));
  });

  it("reads runes where the resolver puts them: a blow keeps its row's power, a Volley its added darts in its count, a Bolt its cut in its power", () => {
    const stats = computeHeroStats({ weapon: gear('fire') }, registry, {
      pair: { primary: 'fire', secondary: null },
      basic: [{ kind: 'heavy', element: 'fire', runes: [III('heavy')] }],
    });
    // A blow's power knob stays in its knobs, so Power counts Heavy once.
    const [blow] = stats.weapon.blows;
    expect(blow.power).toBe(stats.weapon.feel.heavy.power);
    expect(blow.knobs.power).toBeCloseTo(1.3);
    expect(blow.runes).toEqual([III('heavy')]);
    const move = (form: 'bolt' | 'volley', runes: RuneRef[]) =>
      resolveAbility(
        registry,
        'primary',
        { kind: 'medium', form, elements: ['fire'], runes },
        'mana',
        stats,
      );
    expect(move('volley', [III('multishot')]).count).toBe(move('volley', []).count + 2);
    expect(move('bolt', [III('multishot')]).power).toBeCloseTo(move('bolt', []).power * 0.725);
  });
});

/** The rune view's rows that hold a rune, and every rune-view row by key. */
const runeRows = dpsCombos(registry).filter((s) => s.view === 'rune');
const byKey = new Map(runeRows.map((s) => [dpsKey(s), s]));
const socketed = runeRows.filter((s) => s.base !== undefined);

/** A Lab setup's hero, as `simulateDps` builds it: a plain common weapon at item level = depth, and its pair. */
function heroOf(s: DpsSetup) {
  const { baseId, primary, secondary } = s.weapon;
  const weapon = sandboxWeapon(registry, { baseId, mana: primary, rarity: 'common', ilvl: DEPTH });
  return computeHeroStats({ weapon }, registry, {
    pair: { primary, secondary },
    basic: s.chains.basic,
  });
}

/** Power's DPS of a setup's held button: the basic attack alone, or one skill on top of it. */
function modelled(s: DpsSetup): number {
  const stats = heroOf(s);
  const dps = (chains: Partial<Chains>) => estimateCombat(stats, registry, DEPTH, chains).dps;
  if (s.hold === 'attack') return dps({});
  const skill = ABILITY_SLOTS[s.hold.slot];
  return dps({ [skill]: s.chains[skill] }) - dps({});
}

/** The Lab's DPS of a setup, on one dummy or the pack (each run once). */
const runs = new Map<string, number>();
function measured(s: DpsSetup, pack: boolean): number {
  const key = `${pack}|${dpsKey(s)}`;
  if (!runs.has(key)) runs.set(key, simulateDps(registry, s, { depth: DEPTH, pack }).dps);
  return runs.get(key)!;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : a > 0 ? Infinity : 1);
/** Up past 5%, down past 5%, or about level. */
const direction = (r: number) => (r > 1.05 ? 1 : r < 0.95 ? -1 : 0);

/**
 * Where a rune's worth is measured: on one dummy, Power's reference foe; but
 * a rune whose worth is on other foes on the pack, since one dummy can't show
 * it (Split's shards skip the foe hit, a Pierce or a Chain needs a second foe,
 * Widen reaches more foes, and a Lance's fan shares one hit set).
 */
const onThePack = (s: DpsSetup) =>
  ['split', 'pierce', 'chain', 'widen'].includes(s.dims.rune) ||
  (s.dims.rune === 'multishot' && s.dims.on === 'lance');

/** Valued for life and mana, not DPS: checked for their sign only. */
const SIGN_ONLY = ['guard', 'leech', 'drain'];

describe('Power values a rune as the DPS Lab measures it (tier III, depth 10)', () => {
  it('in the same direction, and within ±25% of the Lab ratio', () => {
    const misses: string[] = [];
    for (const s of socketed) {
      if (SIGN_ONLY.includes(s.dims.rune)) continue;
      const base = byKey.get(s.base!)!;
      const pack = onThePack(s);
      const lab = ratio(measured(s, pack), measured(base, pack));
      const power = ratio(modelled(s), modelled(base));
      if (direction(power) * direction(lab) < 0 || Math.abs(power / lab - 1) > 0.25)
        misses.push(
          `${dpsKey(s)}: Power ×${power.toFixed(2)}, Lab ×${lab.toFixed(2)} (${pack ? 'pack' : 'one dummy'})`,
        );
    }
    expect(misses).toEqual([]);
  }, 60_000);

  it('Guard and Leech add life; Drain never costs DPS, and adds it where mana binds', () => {
    const estimateOf = (s: DpsSetup) => estimateCombat(heroOf(s), registry, DEPTH, s.chains);
    let drained = 0;
    for (const s of socketed) {
      if (!SIGN_ONLY.includes(s.dims.rune)) continue;
      const [now, before] = [estimateOf(s), estimateOf(byKey.get(s.base!)!)];
      if (s.dims.rune !== 'drain') expect(now.ehp, dpsKey(s)).toBeGreaterThan(before.ehp);
      else {
        expect(now.dps, dpsKey(s)).toBeGreaterThanOrEqual(before.dps);
        if (now.dps > before.dps) drained++;
      }
    }
    expect(drained).toBeGreaterThan(0);
  });
});
```

The goldens in the first test are v0.50.0's own numbers, measured at `81b0e31` with the built engine (`estimateCombat(profileStats(p), …, heroChains(p))`). Waves 0 and 1 claim no change without runes, and this task adds none.

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: FAIL, 2 failed and 3 passed (5).
- The goldens, the empty sockets and the resolver pins pass already. If the goldens fail, waves 0 or 1 changed Power without runes: stop and report the numbers. (The goldens were checked against wave 0's draft, before and after this task's Step 3.)
- The ±25% test fails, its `misses` listing about 70 rows. Every Echo, Split, Saturate and Volatile row reads Power ×1.00 against a Lab ratio above 1, and every Multi-shot row on a Bolt or Lance reads only its cut (Power ×0.73).
- The sign test fails at its first Leech row, since Leech comes before Guard in `runes.json`: `rune|leech|bolt|fire|III: expected <ehp> to be greater than <ehp>`, the same number twice.

If the resolver pins fail, wave 1 A put a rune's numbers somewhere else, and the terms below would miscount. If a blow's power is not its row's, the power knob is folded in and `blowRunes` would count it twice. If a Volley's count lacks its darts, `shots` would divide by the wrong count. Stop and report.

- [ ] **Step 3: Power's rune terms**

In `packages/engine/src/delve/hero-stats.ts`:

Replace:

```ts
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
```

with:

```ts
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Power's rune constants (see the runes spec): an extra shot or a shard finds
 * a foe half the time, a finitely pierced foe counts a quarter, reactions are
 * a fifth of a hit's worth (Volatile's share), and an extra stack is 5%.
 */
const EXTRA_SHOT = 0.5;
const PIERCED_FOE = 0.25;
const REACTION_SHARE = 0.2;
const PER_STACK = 0.05;

type KnobSet = ResolvedAbility['knobs'];

/** Impacts one use lands: a Barrage's count, a Maelstrom's ticks, else one. */
function repeatsOf(ab: ResolvedAbility): number {
  return ab.form.id === 'barrage'
    ? ab.count
    : ab.form.id === 'maelstrom'
      ? ab.duration / ab.tick
      : 1;
}

/**
 * What one impact is worth, in hits: its `targets` (sized by area), a finite
 * pierce's foes (at most 3; an Earth move's endless pierce adds nothing), its
 * chain's jumps, its lingering ground and Split's shards.
 */
function reach(k: KnobSet, targets: number, bal: DelveBalance): number {
  const pierced = Number.isFinite(k.pierce) ? PIERCED_FOE * Math.min(k.pierce, 3) : 0;
  let jumps = 0;
  for (let i = 1; i <= k.chain; i++) jumps += Math.pow(bal.abilities.chainPower, i);
  const zone = k.zone ? (k.zone.seconds / 0.5) * k.zone.tickPower * targets : 0;
  const shards = k.split ? EXTRA_SHOT * k.split.count * k.split.power : 0;
  return targets + pierced + jumps + zone + shards;
}

/** What scales a whole use: Echo's repeat, Volatile's reactions and Saturate's stacks (1 without). */
function boost(k: KnobSet): number {
  return (1 + k.echo) * (1 + REACTION_SHARE * k.catalyst) * (1 + PER_STACK * k.stacksBonus);
}

/**
 * Multi-shot on a move (its per-shot cut is in its power already): a Bolt's or
 * a Lance's fan, each extra shot finding a foe half the time; a Volley's added
 * darts (in its `count`). A Barrage's are in its repeats.
 */
function shots(ab: ResolvedAbility): number {
  const extra = ab.knobs.extraShots;
  if (!extra) return 1;
  if (ab.form.id === 'volley') return ab.count / (ab.count - extra.count);
  return ab.form.id === 'bolt' || ab.form.id === 'lance' ? 1 + EXTRA_SHOT * extra.count : 1;
}

/**
 * A basic blow's runes as a factor on its hit (1 without): its power knob,
 * Multi-shot's fan at its per-shot power, its reach (Widen on a melee cleave)
 * over the plain cleave, and its boost.
 */
function blowRunes(k: KnobSet, cleave: number, bal: DelveBalance): number {
  const fan = k.extraShots ? (1 + EXTRA_SHOT * k.extraShots.count) * k.extraShots.power : 1;
  return (k.power * fan * reach(k, cleave * (1 + (k.area - 1) * 0.5), bal) * boost(k)) / cleave;
}

/**
 * Mana a use of a chain drains: each move's per foe-hit × its foe-hits (its
 * foes × its impacts), at most `drainFoes`.
 */
function drainPerUse(chain: ResolvedChain, bal: DelveBalance): number {
  return mean(
    chain.moves.map((_, i) => {
      const ab = valuedMove(chain, i);
      const hits = TARGETS[ab.form.id] * repeatsOf(ab);
      return ab.knobs.manaOnHit * Math.min(hits, bal.runes.drainFoes);
    }),
  );
}

/** Each move's Guard: the share of life it shields on landing. */
function guards(chain: ResolvedChain): number[] {
  return chain.moves.map((_, i) => valuedMove(chain, i).knobs.guardOnLand);
}

/**
 * Guard's barrier on a chain as a share of life: each move's value × the
 * share of `guardSeconds` it covers between its landings (the per-use
 * interval × the chain's length); the largest.
 */
function guardShare(values: number[], interval: number, bal: DelveBalance): number {
  const between = interval * values.length;
  return Math.max(...values.map((v) => v * Math.min(1, bal.runes.guardSeconds / between)));
}

/** A chain's lifesteal from its runes alone, averaged over its moves (a rune's lifesteal adds). */
function runeLeech(registry: DataRegistry, chain: ResolvedChain | null): number {
  if (!chain) return 0;
  return mean(
    chain.moves.map((_, i) =>
      valuedMove(chain, i).runes.reduce(
        (sum, r) => sum + (registry.getRune(r.id).tiers[r.tier - 1].lifesteal ?? 0),
        0,
      ),
    ),
  );
}
```

Replace:

```ts
 * bonus, a hold at full charge), counting jumps, lingering ground and repeats.
```

with:

```ts
 * bonus, a hold at full charge), counting jumps, lingering ground and repeats,
 * and its runes through their knobs (`reach`, `shots`, `boost`).
```

Replace:

```ts
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
```

with:

```ts
      const k = ab.knobs;
      const targets = TARGETS[ab.form.id] * (1 + (k.area - 1) * 0.5);
      const step = stepBonus(bal, ab.index).power;
      const perHit = hit * ab.power * step * (1 + stats.elementPower[ab.element]);
      return perHit * reach(k, targets, bal) * repeatsOf(ab) * shots(ab) * boost(k);
```

Replace:

```ts
 * toward survival. A skill left out of `chains` counts nothing.
```

with:

```ts
 * toward survival. A skill left out of `chains` counts nothing. Runes count
 * through their knobs: the moves' in `damagePerUse`, the blows' in
 * `blowRunes` and their time, Drain as mana, Guard as a barrier and Leech as
 * sustain (see the runes spec).
```

Replace the lines from `// Each blow's power × its element's power, over the chain's time.` up to (not including) `const phoenix = 1 + ((L.phoenix_plume ?? 0) / 100) * 0.5;` with:

```ts
  // Each blow's power × its element's power × its runes (`blowRunes`), over the chain's time
  // (a blow's Quick or Heavy scales its share of it).
  const blows = stats.weapon.blows;
  const stringTime = blows.reduce((a, s) => a + s.time * s.knobs.quick.beat, 0);
  const strikeInterval = (stats.attackInterval * stringTime) / blows.length;
  const value = (b: (typeof blows)[number]) => b.attunePower * (1 + stats.elementPower[b.element]);
  // Twin Fang: one extra hit on the last blow, at its value (×1.5 melee, ×1 ranged; no runes).
  const twin = ((L.twin_fang ?? 0) / 100) * (melee ? 1.5 : 1);
  const stringValue =
    blows.reduce((a, b) => a + b.power * value(b) * blowRunes(b.knobs, cleave, bal), 0) +
    twin * value(blows[blows.length - 1]);
  const basicDps = (hit * cleave * (stringValue / stringTime)) / stats.attackInterval;
  let dps = basicDps;

  const [primary, defensive, ultimate] = ABILITY_SLOTS.map((slot) => {
    const chain = chains[slot];
    return chain ? resolveChain(registry, stats, slot, chain) : null;
  });
  const pool = manaPool(stats, registry);
  const unit = Math.max(1, stats.weaponDamage * stats.damageMult);
  const every = (chain: ResolvedChain, income: number, rate: number) =>
    useInterval(bal, chain, stats.tempo, income, rate);
  // Drain: mana per foe-hit, the blows' on each strike and each skill's on each use, over its
  // interval at the income before Drain (one pass).
  const income = pool.regen + bal.mana.basicAttackGain / strikeInterval;
  const drained = (chain: ResolvedChain | null, share: number) => {
    const perUse = chain ? drainPerUse(chain, bal) : 0;
    return perUse > 0 ? perUse / every(chain!, income * share, dps / unit) : 0;
  };
  const manaIncome =
    income +
    mean(blows.map((b) => b.knobs.manaOnHit * Math.min(cleave, bal.runes.drainFoes))) /
      strikeInterval +
    drained(primary, 0.7) +
    drained(ultimate, 0.3) +
    drained(defensive, 0.3);
  const primaryEvery = primary ? every(primary, manaIncome * 0.7, dps / unit) : 0;
  const primaryDps = primary ? damagePerUse(primary, hit, stats, bal) / primaryEvery : 0;
  // Abilities share the hero's time and mana; count them at partial efficiency.
  dps += primaryDps * 0.75;
  const chargeRate = dps / unit;
  const ultimateEvery = ultimate ? every(ultimate, manaIncome * 0.3, chargeRate) : 0;
  const ultimateDps = ultimate
    ? (damagePerUse(ultimate, hit, stats, bal) / ultimateEvery) * 0.8
    : 0;
  dps += ultimateDps;

  let mitigation = (1 - armorReduction(bal, stats.armor, depth)) * (1 - stats.dodge);
  let bonusLife = 0;
  const guardEvery = defensive ? every(defensive, manaIncome * 0.3, chargeRate) : 0;
  let defensiveDps = 0;
  if (defensive) {
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
    defensiveDps = (damagePerUse(defensive, hit, stats, bal) / Math.max(1, guardEvery)) * 0.5;
    dps += defensiveDps;
  }
  // Guard: a barrier of its share of life for `guardSeconds` each time its move lands, the
  // largest counting (it never stacks), valued as a Ward's.
  const shield = Math.max(
    guardShare(
      blows.map((b) => b.knobs.guardOnLand),
      strikeInterval,
      bal,
    ),
    primary ? guardShare(guards(primary), primaryEvery, bal) : 0,
    ultimate ? guardShare(guards(ultimate), ultimateEvery, bal) : 0,
    defensive ? guardShare(guards(defensive), guardEvery, bal) : 0,
  );
  bonusLife += stats.maxHp * shield * 2;

  dps += stats.thorns / ref.interval;
  // Leech: each part of the DPS heals by its runes' lifesteal (an element's own lifesteal on an
  // ability isn't counted, as before runes).
  const leech =
    basicDps * mean(blows.map((b) => b.knobs.lifesteal)) +
    primaryDps * 0.75 * runeLeech(registry, primary) +
    ultimateDps * runeLeech(registry, ultimate) +
    defensiveDps * runeLeech(registry, defensive);
  const sustain = dps * stats.lifesteal + leech;
```

Why nothing moves without runes: each term is evaluated in today's order, then times an exact 1 or plus an exact 0. `blowRunes` gives `(1 × 1 × cleave × 1) / cleave`, exactly 1. `reach` gives `targets + 0 + jumps + zone + 0`. `s.time × 1`. The income `+ 0/strikeInterval + 0 + 0 + 0`. The barrier `maxHp × 0 × 2`. The sustain `+ 0`. The goldens check it.

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: PASS, 5 tests (about 3 s: about 250 Lab runs at about 3 ms each).

If the ±25% test still fails, its message lists each miss with both ratios. That is the spec's check of its own constants (0.5, 0.25, 0.2, 0.05) and of Power's older terms that runes now reach. **The numbers are the user's call**: stop and report the list. Don't tune the constants or the yardstick.

A trial of the resolver's merge on wave 0's draft, with none of wave 1 A's sim handlers, showed which misses come from Power's older terms rather than this task's:
- **Linger on a form:** Power ×2.00 (the `zone` term, as for Magma) against a Lab ratio of about ×1.5 on one dummy.
- **Widen on a Burst, Nova or Maelstrom:** Power ×1.10 (the `area` term) against ×0.90 on the pack. The pack's clump sits inside those radii already, so the wider radius reaches nobody new and only the 90% trade-off shows.

Expect those whatever wave 1 does. Other likely misses are Multi-shot on a Bolt (the fan may all land on one dummy: Lab near ×2.2 against Power's ×1.45) and Chain on blows (Power ×1.5 to ×2.2, where a melee cleave already reaches the clump).

- [ ] **Step 5: The whole engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors. Every test passes, 5 more than after Task 1. The pacing rails are unchanged: the autopilot sockets nothing yet, so no hero it plays holds a rune.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-power-lab
(cd packages/engine && npx prettier --write src/delve/hero-stats.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/delve/hero-stats.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): Power values socketed runes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 2: Engine: the bot and the autopilot

### Task 3: The arena bot picks up runes on its way (routed: see Cross-area needs)

When no foe is near, the bot detours for loot within 6 units. A rune counts as loot now, as an item does. Runes aren't magnetised (the spec's "walked over like an item"), so without the detour the bot would only get them when the cleared floor vacuums the drops.

**Files:**
- Modify: `packages/engine/src/arpg/bot.ts` (needs the controller's routing)
- Modify: `packages/engine/tests/delve-rune-power.test.ts`

- [ ] **Step 0: Check that wave 1 didn't make the change already**

Run: `grep -n "d.kind === 'rune'" packages/engine/src/arpg/bot.ts`
Expected: no output. If it prints the detour line, wave 1 made the change: skip this task.

- [ ] **Step 1: Write the failing test**

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
import { dpsCombos, dpsKey, simulateDps, type DpsSetup } from '../src/arpg/dps-sim.js';
```

with:

```ts
import { botInput } from '../src/arpg/bot.js';
import { dpsCombos, dpsKey, simulateDps, type DpsSetup } from '../src/arpg/dps-sim.js';
```

Replace:

```ts
import { chainsOf, gear, registry, withChains } from './fixtures/arena.js';
```

with:

```ts
import { arena, chainsOf, dummy, gear, registry, withChains } from './fixtures/arena.js';
```

Append at the end of the file:

```ts
describe('the bot and rune drops', () => {
  it('detours for a rune on the floor, as for an item, while no foe is near', () => {
    // The hero stands at (13, 36); its only foe is far up the arena.
    const w = arena([dummy(13, 10)]);
    w.drops.push({
      id: 9000,
      kind: 'rune',
      x: 16,
      y: 36,
      rune: { id: 'echo', tier: 1 },
      amount: 0,
      born: 0,
      vacuum: false,
      dead: false,
    });
    expect(botInput(registry, w).move.x).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: FAIL, 1 failed and 5 passed (6): `expected 0 to be greater than 0.9`. The bot walks straight at the far foe.

- [ ] **Step 3: The detour takes runes**

In `packages/engine/src/arpg/bot.ts`:

Replace:

```ts
      (d) => !d.dead && d.kind === 'item' && dist(h.x, h.y, d.x, d.y) < 6,
```

with:

```ts
      (d) => !d.dead && (d.kind === 'item' || d.kind === 'rune') && dist(h.x, h.y, d.x, d.y) < 6,
```

- [ ] **Step 4: Run it again**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: PASS, 6 tests.

- [ ] **Step 5: The whole engine, the pacing rails included**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes. The detour changes where the bot walks, so the autopilot's fights (and the pacing numbers) may shift a little; every rail must still hold. **If a rail in `delve-pacing.test.ts` fails, stop:** build (`(cd packages/engine && pnpm build)`), run `node $S/runes-before/pacing.mjs C:/Projects/alloy-power-lab/packages/engine/dist/index.js` (with `S` as in Base), and report its lines beside `$S/runes-before/pacing-before.txt`. Don't tune.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-power-lab
(cd packages/engine && npx prettier --write src/arpg/bot.ts tests/delve-rune-power.test.ts)
git add packages/engine/src/arpg/bot.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): the arena bot picks up runes on its way" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: The autopilot fuses, opens sockets and sockets its best runes

Between dives, after the transfer, the forge's fusing and salvage and the slots (`spendLinks`), and before the upgrades:
1. it fuses every triple, lowest tier first;
2. it opens sockets with the Links the slots left, the cheapest first, the Primary's moves first, then the Basic's, the Ultimate's and the Defensive's, each chain from its first move;
3. it fills each socket with the pouch rune that raises `profilePower` most, changing a filled socket only for a rune that gains Power.

At a stop, it takes `'rune'` second, after equip: the rune into an empty socket that raises Power most. A transfer that would destroy runes is already valued without them (see "Where the spec left room"); a test pins that.

**Files:**
- Modify: `packages/engine/src/delve/autopilot.ts` (CRLF; never format)
- Modify: `packages/engine/tests/delve-rune-power.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/delve-rune-power.test.ts`:

Replace:

```ts
import { computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
```

with:

```ts
import { betweenDives, takeBestStop } from '../src/delve/autopilot.js';
import { startDive } from '../src/delve/dive.js';
import { compareItem, computeHeroStats, estimateCombat } from '../src/delve/hero-stats.js';
import { movesOf } from '../src/delve/moveset.js';
```

Replace:

```ts
import { createDelveProfile } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
```

with:

```ts
import { createDelveProfile, referenceDepth } from '../src/delve/profile.js';
import { generateItem } from '../src/loot/item-generator.js';
import { pouchCount, socketsOf } from '../src/loot/runes.js';
```

Replace:

```ts
import { ABILITY_SLOTS, type Chains } from '../src/types/ability.js';
import type { DelveProfile } from '../src/types/delve.js';
```

with:

```ts
import { ABILITY_SLOTS, type Chains, type ChainSkill } from '../src/types/ability.js';
import type { DelveProfile, DiveStop } from '../src/types/delve.js';
import type { GearItem } from '../src/types/gear.js';
```

Append at the end of the file:

```ts
describe('the autopilot and runes', () => {
  /** A Fire hero after its first dive (past the free edits), wielding `weapon` (its starter sword by default). */
  const veteran = (weapon?: GearItem): DelveProfile => {
    const p = createDelveProfile(registry, 3, { primary: 'fire' });
    return {
      ...p,
      equipped: { ...p.equipped, weapon: weapon ?? p.equipped.weapon! },
      stats: { ...p.stats, dives: 1 },
    };
  };
  /** `p` with its Primary one medium Fire Bolt whose sockets hold `runes`. */
  const bolt = (p: DelveProfile, runes: (RuneRef | null)[]) =>
    withChains(p, {
      primary: {
        moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'], runes }],
        payment: 'mana',
      },
    });
  const primaryRunes = (p: DelveProfile) => chainsOf(p).primary!.moves[0].runes;
  const sockets = (p: DelveProfile, skill: ChainSkill) =>
    movesOf(chainsOf(p)[skill]).map((m) => socketsOf(m).length);
  /** `p` diving, on the door screen after depth 1, holding `stop`. */
  const atStop = (p: DelveProfile, stop: DiveStop): DelveProfile => {
    const diving = startDive(registry, p, 1);
    const dive = diving.dive!;
    return {
      ...diving,
      dive: { ...dive, phase: 'choosing', depthsCleared: 1, doorChoices: ['winding'], stop },
    };
  };

  it('fuses every triple, lowest tier first, so a fused rune can make a triple above it', () => {
    const p = { ...veteran(), runes: { split: [3, 2, 0, 0, 0] }, scrap: 60 };
    const after = betweenDives(registry, p);
    expect(after.runes.split).toEqual([0, 0, 1, 0, 0]);
    expect(after.scrap).toBe(0); // 20 for the II, 40 for the III
  });

  it('opens sockets with the Links the slots leave: the cheapest first, the Primary first', () => {
    const magic = generateItem(
      registry,
      { uid: 'm', ilvl: 5, rarity: 'magic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(1),
    );
    const five = <T>(make: () => T): T[] => Array.from({ length: 5 }, make);
    // Every chain it carries at its cap of 5, so no Link goes to a slot; two sockets a move.
    const full = withChains(veteran(magic), {
      basic: five(() => ({ kind: 'medium' as const, element: 'fire' as const })),
      primary: {
        moves: five(() => ({
          kind: 'medium' as const,
          form: 'bolt' as const,
          elements: ['fire' as const],
        })),
        payment: 'mana',
      },
      defensive: {
        moves: five(() => ({
          kind: 'medium' as const,
          form: 'ward' as const,
          elements: ['fire' as const],
        })),
        payment: 'mana',
      },
    });
    // 15 first sockets (1 Link + 20 scrap each), then the Primary's first move's second (2 + 40).
    const after = betweenDives(registry, { ...full, links: 17, scrap: 340 });
    expect(sockets(after, 'primary')).toEqual([2, 1, 1, 1, 1]);
    expect(sockets(after, 'basic')).toEqual([1, 1, 1, 1, 1]);
    expect(sockets(after, 'defensive')).toEqual([1, 1, 1, 1, 1]);
    expect(after).toMatchObject({ links: 0, scrap: 0 });
  });

  it('sockets the pouch rune that raises Power most, and keeps the rest', () => {
    const p = {
      ...bolt(veteran(), [null]),
      runes: { echo: [0, 0, 1, 0, 0], leech: [1, 0, 0, 0, 0] },
    };
    const after = betweenDives(registry, p);
    expect(primaryRunes(after)).toEqual([III('echo')]);
    expect(after.runes).toMatchObject({ echo: [0, 0, 0, 0, 0], leech: [1, 0, 0, 0, 0] });
  });

  it('changes a socketed rune only for one that gains Power (in destroy mode the old one is gone)', () => {
    const leeched = {
      ...bolt(veteran(), [{ id: 'leech', tier: 1 }]),
      runes: { echo: [0, 0, 1, 0, 0] },
    };
    const swapped = betweenDives(registry, leeched);
    expect(primaryRunes(swapped)).toEqual([III('echo')]);
    expect(pouchCount(swapped.runes, { id: 'leech', tier: 1 })).toBe(0);
    const echoed = { ...bolt(veteran(), [III('echo')]), runes: { leech: [1, 0, 0, 0, 0] } };
    const kept = betweenDives(registry, echoed);
    expect(primaryRunes(kept)).toEqual([III('echo')]);
    expect(pouchCount(kept.runes, { id: 'leech', tier: 1 })).toBe(1);
  });

  it('at a stop, sockets the rune that gains most: second after equip, before an upgrade', () => {
    const p = atStop(
      { ...bolt(veteran(), [null]), runes: { echo: [0, 0, 1, 0, 0] }, scrap: 1000 },
      { offers: ['rune', 'upgrade'], taken: false },
    );
    const after = takeBestStop(registry, p);
    expect(primaryRunes(after)).toEqual([III('echo')]);
    expect(after.scrap).toBe(1000);
    expect(after.dive!.stop!.taken).toBe(true);
  });

  it('values a transfer without the runes it would destroy (a rare holds two sockets a move)', () => {
    const epic = generateItem(
      registry,
      { uid: 'e', ilvl: 10, rarity: 'epic', slot: 'weapon', baseId: 'sword', mana: 'fire' },
      new SeededRNG(4),
    );
    const value = (runes: (RuneRef | null)[]) => {
      const p = bolt(veteran(epic), runes);
      const twin = { ...p.equipped.weapon!, uid: 'twin', rarity: 'rare' as const };
      return compareItem(p.equipped, twin, registry, referenceDepth(p), p.pair);
    };
    // Echo III in the first socket moves with the move; in the third, past the rare's cap, it's destroyed.
    const kept = value([III('echo'), null, null]);
    const lost = value([null, null, III('echo')]);
    expect(lost.power).toBe(kept.power);
    expect(lost.newPower).toBeLessThan(kept.newPower);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: FAIL, 5 failed and 7 passed (12; 11 if Task 3 was skipped).
- Fusing: `expected [ 3, 2, 0, 0, 0 ] to deeply equal [ 0, 0, 1, 0, 0 ]`.
- Opening: `expected [ 0, 0, 0, 0, 0 ] to deeply equal [ 2, 1, 1, 1, 1 ]`.
- Socketing: `expected [ null ] to deeply equal [ { id: 'echo', tier: 3 } ]`.
- Changing: `expected [ { id: 'leech', tier: 1 } ] to deeply equal [ { id: 'echo', tier: 3 } ]`.
- The stop: it upgrades instead, so `expected [ null ] to deeply equal [ { id: 'echo', tier: 3 } ]`.

The transfer test passes already: wave 1 B's `movesetTransfer` leaves the destroyed rune off the moved moveset, so `compareItem`'s home value counts it as lost.

- [ ] **Step 3: The rune policy**

In `packages/engine/src/delve/autopilot.ts` (CRLF: keep it):

Replace:

```ts
 * forges and adds slots. Used by the pacing test and for balance sweeps.
```

with:

```ts
 * forges, adds slots and sockets runes. Used by the pacing test and for balance sweeps.
```

Replace:

```ts
import { heroChains } from '../loot/moveset.js';
```

with:

```ts
import { heroChains, movesetOf } from '../loot/moveset.js';
```

Replace:

```ts
import { addSlot, setChain, transferMoveset } from './moveset.js';
```

with:

```ts
import { addSlot, movesOf, setChain, transferMoveset, withMove } from './moveset.js';
import { fuseRunes, openSocket } from './runes.js';
import { pouchCount, runeFits, socketCap, socketsOf } from '../loot/runes.js';
```

Replace:

```ts
import type { ChainSkill } from '../types/ability.js';
```

with:

```ts
import type { Blow, ChainSkill, Move } from '../types/ability.js';
import { RUNE_TIERS, type RuneRef, type RuneTarget, type RuneTier } from '../types/rune.js';
```

Replace:

```ts
/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else upgrade its cheapest affordable equipped item;
 * else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
```

with:

```ts
/** Every move of the equipped weapon's chains, in `SLOT_ORDER`, each chain from its first. */
function weaponMoves(
  registry: DataRegistry,
  p: DelveProfile,
): { skill: ChainSkill; index: number; move: Move | Blow }[] {
  const weapon = p.equipped.weapon;
  if (!weapon) return [];
  const { chains } = movesetOf(registry, weapon);
  return SLOT_ORDER.flatMap((skill) =>
    movesOf(chains[skill]).map((move, index) => ({ skill, index, move })),
  );
}

/** What a move's runes sit on: its form, or the equipped weapon's blow. */
function targetOf(p: DelveProfile, move: Move | Blow): RuneTarget {
  return 'form' in move
    ? { form: move.form }
    : { weapon: p.equipped.weapon?.baseId ?? null, kind: move.kind };
}

/** The pouch runes the bot weighs: each id's highest tier held, in `runes.json` order. */
function pouchBest(registry: DataRegistry, p: DelveProfile): RuneRef[] {
  return registry.getRunes().flatMap(({ id }) => {
    for (let tier = RUNE_TIERS; tier >= 1; tier--) {
      const ref = { id, tier: tier as RuneTier };
      if (pouchCount(p.runes, ref) > 0) return [ref];
    }
    return [];
  });
}

/**
 * Whether `rune` may go in socket `socket` of `move`: it fits the move, and no
 * rune of its id is on the move (but a lower tier of it in that socket).
 */
function takes(
  registry: DataRegistry,
  p: DelveProfile,
  move: Move | Blow,
  socket: number,
  rune: RuneRef,
): boolean {
  return (
    runeFits(registry.getRune(rune.id), targetOf(p, move)) &&
    socketsOf(move).every((r, k) => r?.id !== rune.id || (k === socket && r.tier < rune.tier))
  );
}

/** Fuse every triple in the pouch, lowest tier first, so a fused rune can make a triple above it. */
function fusePouch(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const need = registry.getDelveBalance().runes.fuseCount;
  let p = profile;
  for (let tier = 1; tier < RUNE_TIERS; tier++)
    for (const { id } of registry.getRunes()) {
      const ref = { id, tier: tier as RuneTier };
      while (pouchCount(p.runes, ref) >= need) {
        const res = fuseRunes(registry, p, ref);
        if (!res.ok) return p; // short of scrap: every later fuse costs as much or more
        p = res.profile;
      }
    }
  return p;
}

/**
 * Open sockets with the Links the slots left: each time on the move whose next
 * socket is cheapest (the fewest open; on a tie, the first in `SLOT_ORDER`),
 * below the weapon's cap, while it can pay.
 */
function openSockets(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  const cap = socketCap(registry, profile.equipped.weapon?.rarity ?? null);
  let p = profile;
  for (;;) {
    let next: { skill: ChainSkill; index: number; open: number } | null = null;
    for (const { skill, index, move } of weaponMoves(registry, p)) {
      const open = socketsOf(move).length;
      if (open < cap && (!next || open < next.open)) next = { skill, index, open };
    }
    if (!next) return p;
    const res = openSocket(registry, p, next.skill, next.index);
    if (!res.ok) return p;
    p = res.profile;
  }
}

/**
 * Fill the sockets in `SLOT_ORDER`, each chain from its first move: each takes
 * the pouch rune that raises Power most (`takes`); a filled one changes only
 * for a rune that gains Power, its own pulled by the pull rule.
 */
function socketBest(registry: DataRegistry, profile: DelveProfile): DelveProfile {
  let p = profile;
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (let socket = 0; socket < socketsOf(move).length; socket++) {
      let best = { profile: p, power: profilePower(registry, p) };
      for (const rune of pouchBest(registry, p)) {
        const chain = movesetOf(registry, p.equipped.weapon!).chains[skill]!;
        const now = movesOf(chain)[index];
        if (!takes(registry, p, now, socket, rune)) continue;
        const runes = socketsOf(now).map((r, k) => (k === socket ? rune : r));
        const res = setChain(registry, p, skill, withMove(chain, index, { ...now, runes }));
        const power = res.ok ? profilePower(registry, res.profile) : 0;
        if (res.ok && power > best.power) best = { profile: res.profile, power };
      }
      p = best.profile;
    }
  return p;
}

/** A stop's rune: the pouch rune into an empty socket that raises Power most, or null when none gains. */
function runeStop(
  registry: DataRegistry,
  profile: DelveProfile,
  take: (action: StopAction) => DelveProfile | null,
): DelveProfile | null {
  let best: { profile: DelveProfile; power: number } | null = null;
  const now = profilePower(registry, profile);
  for (const { skill, index, move } of weaponMoves(registry, profile))
    for (const [socket, held] of socketsOf(move).entries()) {
      if (held) continue;
      for (const rune of pouchBest(registry, profile)) {
        if (!takes(registry, profile, move, socket, rune)) continue;
        const taken = take({ kind: 'rune', skill, index, socket, rune });
        const power = taken ? profilePower(registry, taken) : 0;
        if (taken && power > (best?.power ?? now)) best = { profile: taken, power };
      }
    }
  return best?.profile ?? null;
}

/**
 * At a stop between depths, by preference: equip the bag item that beats its
 * gear the most as it is; else socket the pouch rune that raises Power most
 * into an empty socket (free); else upgrade its cheapest affordable equipped
 * item; else add an affordable slot (in `SLOT_ORDER`); else skip (the door).
 */
export function takeBestStop(registry: DataRegistry, profile: DelveProfile): DelveProfile {
```

Replace:

```ts
  if (stop.offers.includes('upgrade')) {
```

with:

```ts
  if (stop.offers.includes('rune')) {
    const socketed = runeStop(registry, profile, take);
    if (socketed) return socketed;
  }
  if (stop.offers.includes('upgrade')) {
```

Replace:

```ts
/**
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
 * spare triples, melt junk, spend Links on slots, and pour scrap into upgrades.
 */
```

with:

```ts
/**
 * Between dives: move the moveset to a better weapon, equip upgrades, fuse
 * spare triples, melt junk, spend Links on slots, then the runes (fuse, open
 * sockets with the Links left, socket the best), and pour scrap into upgrades.
 */
```

Replace:

```ts
  p = spendLinks(registry, p);
```

with:

```ts
  p = spendLinks(registry, p);
  p = socketBest(registry, openSockets(registry, fusePouch(registry, p)));
```

Check the line endings afterwards: `file packages/engine/src/delve/autopilot.ts` should still say `with CRLF line terminators`, and `git diff --stat` should show only the changed lines, not the whole file.

- [ ] **Step 4: Run the tests again**

Run: `(cd packages/engine && npx vitest run tests/delve-rune-power.test.ts)`
Expected: PASS, 12 tests (11 if Task 3 was skipped).

- [ ] **Step 5: The whole engine, the pacing rails included**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes, the pacing rails with the autopilot using runes (the spec's gate on pacing).

**If a rail in `delve-pacing.test.ts` fails, stop and report; never tune** (the spec: drop chances, socket prices, tier numbers or a changed rail are the user's call). Take the numbers from a build, beside wave 0's:

```bash
cd /c/Projects/alloy-power-lab
S=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/runes-d
(cd packages/engine && pnpm build)
node $S/runes-before/pacing.mjs C:/Projects/alloy-power-lab/packages/engine/dist/index.js | tee $S/runes-d/pacing-after.txt
cat $S/runes-before/pacing-before.txt
```

Report which rail broke, both files, and the time the engine suite took. The rune policy adds `profilePower` calls (about 0.02 ms each) between dives, so the suite should take about the same.

- [ ] **Step 6: Commit**

```bash
cd /c/Projects/alloy-power-lab
(cd packages/engine && npx prettier --write tests/delve-rune-power.test.ts)
git add packages/engine/src/delve/autopilot.ts packages/engine/tests/delve-rune-power.test.ts
git commit -m "feat(engine): the autopilot fuses, opens sockets and sockets its best runes, and takes a stop's rune second" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

## Chunk 3: Client: the Lab's Runes view

### Task 5: The DPS Lab page shows the rune view with its "× none" ratio

The Lab page gets a third tab, **Runes**, over the grid's `'rune'` rows. Its table adds a "× none" column: each row's DPS over its baseline's (`DpsSetup.base`), "—" for a baseline or a row whose baseline hasn't run or dealt nothing. The page still never names a dimension: its chips, columns and colours come from the rows' `dims`.

**Files:**
- Modify: `packages/client/src/features/delve/lab/lab-model.ts`
- Modify: `packages/client/src/features/delve/lab/LabTable.tsx`
- Modify: `packages/client/src/pages/DelveLab.tsx`
- Modify: `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`
- Modify: `packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx`
- Modify: `packages/client/src/pages/__tests__/DelveLab.test.tsx`

- [ ] **Step 1: The client on this engine**

Run: `(cd packages/engine && pnpm build)`
Expected: the build succeeds. The client's `@alloy/engine` junction points at the worktree's engine, so the client now sees the rune view and `DpsSetup.base`. Then run `(cd packages/client && npx tsc --noEmit -p . && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)`. Expected: no type errors, and the Lab's tests pass as they are: the page's views filter by `view`, and the new rows are only more rows.

- [ ] **Step 2: Write the failing tests**

In `packages/client/src/features/delve/lab/__tests__/lab-model.test.ts`:

Replace:

```ts
  PALETTE,
  dimGroups,
  formatDps,
```

with:

```ts
  PALETTE,
  baseRatios,
  dimGroups,
  formatDps,
  formatRatio,
```

Replace:

```ts
  it('shows DPS to a tenth below 100, whole above', () => {
    expect(formatDps(12.345)).toBe('12.3');
    expect(formatDps(1046.4)).toBe('1046');
  });
});
```

with:

```ts
  it('shows DPS to a tenth below 100, whole above', () => {
    expect(formatDps(12.345)).toBe('12.3');
    expect(formatDps(1046.4)).toBe('1046');
  });

  it("divides each row's DPS by its baseline's: none without a baseline, or one that dealt nothing", () => {
    const run = (key: string, dps: number, base?: string): LabRow => ({
      key,
      setup: { view: 'rune', dims: {}, base } as unknown as DpsSetup,
      result: { series: [dps], dps, casts: 1 },
    });
    const rows = [
      run('none', 40),
      run('echo', 58, 'none'),
      run('idle', 0),
      run('split', 30, 'idle'),
      run('lost', 9, 'not-run'),
    ];
    expect([...baseRatios(rows)]).toEqual([['echo', 1.45]]);
    expect(formatRatio(1.45)).toBe('×1.45');
    expect(formatRatio(0.9)).toBe('×0.90');
  });
});
```

In `packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx`:

Replace:

```tsx
    fireEvent.click(screen.getByTestId('lab-tick-nova|frost'));
    expect(onTick).toHaveBeenCalledWith('nova|frost');
  });
});
```

with:

```tsx
    fireEvent.click(screen.getByTestId('lab-tick-nova|frost'));
    expect(onTick).toHaveBeenCalledWith('nova|frost');
    expect(screen.queryByText('× none')).toBeNull();
  });

  it('with ratios, a × none column: each row over its baseline, — without one', () => {
    render(
      <LabTable
        rows={[row('echo|bolt', 58), row('none|bolt', 40)]}
        columns={['form', 'first']}
        ticked={new Set()}
        onTick={() => {}}
        ratios={new Map([['echo|bolt', 1.45]])}
      />,
    );
    expect(screen.getByText('× none')).toBeInTheDocument();
    expect(screen.getAllByTestId('lab-ratio').map((c) => c.textContent)).toEqual(['×1.45', '—']);
  });
});
```

In `packages/client/src/pages/__tests__/DelveLab.test.tsx`:

Replace:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
```

with:

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react';
```

Replace:

```tsx
    expect(screen.getAllByTestId('lab-row')[1]).toHaveTextContent("can't afford");
  });
```

with:

```tsx
    expect(screen.getAllByTestId('lab-row')[1]).toHaveTextContent("can't afford");
  });

  it('the Runes view gives each row its ratio to its baseline (× none)', () => {
    renderLab();
    latest().reply([
      result('rune|none|bolt|fire|none', 40),
      result('rune|echo|bolt|fire|III', 58),
      result('basic|sword|fire|none', 30),
    ]);
    expect(screen.queryByText('× none')).toBeNull();
    fireEvent.click(screen.getByTestId('lab-tab-rune'));
    expect(rowKeys()).toEqual(['rune|echo|bolt|fire|III', 'rune|none|bolt|fire|none']);
    expect(screen.getByText('× none')).toBeInTheDocument();
    const [echo, none] = screen.getAllByTestId('lab-row');
    expect(within(echo).getByTestId('lab-ratio')).toHaveTextContent('×1.45');
    expect(within(none).getByTestId('lab-ratio')).toHaveTextContent('—');
  });
```

- [ ] **Step 3: Run them to see them fail**

Run: `(cd packages/client && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)`
Expected: FAIL, 3 failed. The model: `TypeError: baseRatios is not a function`. The table: `Unable to find an element with the text: × none`. The page: `Unable to find an element by: [data-testid="lab-tab-rune"]`.

- [ ] **Step 4: The ratios, the column and the tab**

In `packages/client/src/features/delve/lab/lab-model.ts`:

Append at the end of the file:

```ts
/**
 * Each row's DPS over its baseline's (`DpsSetup.base`: a rune row's `none`
 * row), by key. A row has none without a baseline, or while its baseline
 * hasn't run or dealt nothing.
 */
export function baseRatios(rows: readonly LabRow[]): Map<string, number> {
  const dps = new Map(rows.map((r) => [r.key, r.result.dps]));
  const ratios = new Map<string, number>();
  for (const r of rows) {
    const base = r.setup.base === undefined ? 0 : (dps.get(r.setup.base) ?? 0);
    if (base > 0) ratios.set(r.key, r.result.dps / base);
  }
  return ratios;
}

/** A ratio to the baseline, to two places: ×1.45. */
export function formatRatio(ratio: number): string {
  return `×${ratio.toFixed(2)}`;
}
```

In `packages/client/src/features/delve/lab/LabTable.tsx`:

Replace:

```tsx
import { formatDps, type LabRow } from './lab-model';
```

with:

```tsx
import { formatDps, formatRatio, type LabRow } from './lab-model';
```

Replace:

```tsx
 * is greyed as "can't afford". Each row's tick decides whether it is charted.
 */
export function LabTable({
  rows,
  columns,
  ticked,
  onTick,
}: {
```

with:

```tsx
 * is greyed as "can't afford". Each row's tick decides whether it is charted.
 * With `ratios` (the Runes view), a "× none" column gives each row's DPS over
 * its baseline's.
 */
export function LabTable({
  rows,
  columns,
  ticked,
  onTick,
  ratios,
}: {
```

Replace:

```tsx
  /** Keep it the same function: the rows are memoised on it. */
  onTick: (key: string) => void;
}) {
```

with:

```tsx
  /** Keep it the same function: the rows are memoised on it. */
  onTick: (key: string) => void;
  /** Each row's ratio to its baseline, by key (`baseRatios`); without it, no column. */
  ratios?: ReadonlyMap<string, number>;
}) {
```

Replace:

```tsx
          <th className="w-2/5 px-1 py-1 font-normal">DPS</th>
```

with:

```tsx
          <th className="w-2/5 px-1 py-1 font-normal">DPS</th>
          {ratios && <th className="w-14 px-1 py-1 text-right font-normal">× none</th>}
```

Replace:

```tsx
            ticked={ticked.has(r.key)}
            onTick={onTick}
          />
```

with:

```tsx
            ticked={ticked.has(r.key)}
            onTick={onTick}
            ratio={ratios ? (ratios.get(r.key) ?? null) : undefined}
          />
```

Replace:

```tsx
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
```

with:

```tsx
const Row = memo(function Row({
  row,
  columns,
  top,
  ticked,
  onTick,
  ratio,
}: {
  row: LabRow;
  columns: readonly string[];
  top: number;
  ticked: boolean;
  onTick: (key: string) => void;
  /** Its ratio to its baseline; null without one; undefined: no column. */
  ratio?: number | null;
}) {
```

Replace:

```tsx
          "can't afford"
        )}
      </td>
    </tr>
```

with:

```tsx
          "can't afford"
        )}
      </td>
      {ratio !== undefined && (
        <td className="px-1 text-right tabular-nums" data-testid="lab-ratio">
          {ratio === null ? '—' : formatRatio(ratio)}
        </td>
      )}
    </tr>
```

In `packages/client/src/pages/DelveLab.tsx`:

Replace:

```tsx
  BY_LINE,
  dimGroups,
```

with:

```tsx
  BY_LINE,
  baseRatios,
  dimGroups,
```

Replace:

```tsx
  ['ability', 'Abilities'],
```

with:

```tsx
  ['ability', 'Abilities'],
  ['rune', 'Runes'],
```

Replace:

```tsx
 * The DPS Lab (dev builds only): every basic-attack and ability combo's
 * baseline DPS over 30 s, simulated by the engine in a worker, as a ranked
 * table and a chart of the ticked rows. See the DPS Lab spec.
```

with:

```tsx
 * The DPS Lab (dev builds only): every basic-attack, ability and rune combo's
 * baseline DPS over 30 s, simulated by the engine in a worker, as a ranked
 * table and a chart of the ticked rows; the Runes view adds each row's ratio
 * to its baseline ("× none"). See the DPS Lab and runes specs.
```

Replace:

```tsx
  const charted = ticks ?? topTicks(ranked);
```

with:

```tsx
  const charted = ticks ?? topTicks(ranked);
  // The Runes view's "× none": each row's DPS over its baseline's.
  const ratios = useMemo(() => (view === 'rune' ? baseRatios(rows) : undefined), [rows, view]);
```

Replace:

```tsx
        <LabTable rows={ranked} columns={columns} ticked={charted} onTick={tick} />
```

with:

```tsx
        <LabTable rows={ranked} columns={columns} ticked={charted} onTick={tick} ratios={ratios} />
```

- [ ] **Step 5: Run them again**

Run: `(cd packages/client && npx vitest run src/features/delve/lab src/pages/__tests__/DelveLab.test.tsx)`
Expected: PASS, every test in those files, 3 more than in Step 1.

- [ ] **Step 6: The whole client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes, 3 more than at the base.

- [ ] **Step 7: Commit**

```bash
cd /c/Projects/alloy-power-lab
(cd packages/client && npx prettier --write src/features/delve/lab/lab-model.ts src/features/delve/lab/LabTable.tsx src/pages/DelveLab.tsx src/features/delve/lab/__tests__/lab-model.test.ts src/features/delve/lab/__tests__/LabTable.test.tsx src/pages/__tests__/DelveLab.test.tsx)
git add packages/client/src/features/delve/lab/lab-model.ts packages/client/src/features/delve/lab/LabTable.tsx packages/client/src/pages/DelveLab.tsx packages/client/src/features/delve/lab/__tests__/lab-model.test.ts packages/client/src/features/delve/lab/__tests__/LabTable.test.tsx packages/client/src/pages/__tests__/DelveLab.test.tsx
git commit -m "feat(client): the DPS Lab's Runes view, with each row's ratio to its baseline" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

No version bump here: wave 3 ships v0.51.0.

---

## Verification

Run everything from `C:/Projects/alloy-power-lab`, with `S` as in Base, and report each result to the controller.

- [ ] **The engine**

Run: `(cd packages/engine && npx tsc --noEmit -p . && npx vitest run)`
Expected: no type errors; every test passes, the pacing rails included (with the autopilot using runes). There are 18 more tests than at the base (17 without Task 3): 6 in `delve-dps-sim.test.ts`, and the new `delve-rune-power.test.ts`'s 12 (11).

- [ ] **No-rune determinism**

```bash
cd /c/Projects/alloy-power-lab
S=C:/Users/hahnz/AppData/Local/Temp/claude/c--Projects-Alloy/239f61fd-0a16-4600-a17d-7efef362f2cc/scratchpad
mkdir -p $S/runes-d
(cd packages/engine && pnpm build)
E=C:/Projects/alloy-power-lab/packages/engine/dist/index.js
node $S/runes-before/snapshot.mjs $E $S/runes-d/after-depth10.json
node $S/runes-before/identical.mjs $S/runes-before/before-depth10.json $S/runes-d/after-depth10.json
node $S/runes-before/items-hash.mjs $E | tee $S/runes-d/items-hash-after.txt
cat $S/runes-before/items-hash-before.txt
```

Expected:
- `runs 9544` (9,144 old rows and 400 rune rows: 200 rune-view rows on one dummy and on the pack), taking about 40 s.
- `rows 9144 before, 9544 after; differing 0`: every old row is identical. A difference there is a determinism break: report it. It isn't this area's (`dpsCombos` only appends), so name the rows.
- The items hash line equals wave 0's `items-hash-before.txt` (this area rolls no item).
- Power without runes is pinned by `delve-rune-power.test.ts`'s goldens, which ran in the suite.

- [ ] **The pacing numbers and the first dives (changed by design: the autopilot uses runes)**

```bash
node $S/runes-before/pacing.mjs $E | tee $S/runes-d/pacing-after.txt
node $S/runes-before/first-dives.mjs $E | tee $S/runes-d/first-dives-after.txt
diff $S/runes-before/pacing-before.txt $S/runes-d/pacing-after.txt
diff $S/runes-before/first-dives-before.txt $S/runes-d/first-dives-after.txt
```

Expected: every rail holds (the suite says so). The numbers may move: rune pickups, sockets opened with spare Links, socketed runes and the stop's fifth kind all change what the autopilot does. Report both diffs as they are, for wave 3's release notes.

- [ ] **The client**

Run: `(cd packages/client && npx tsc --noEmit -p . && npx vitest run) && (pnpm -F @alloy/client build)`
Expected: no type errors; every test passes, 3 more than at the base; the build succeeds. The Lab stays a dev-only lazy route, so the production bundle doesn't grow with it.

- [ ] **A look at the page (optional, dev server)**

Start the dev server on 5288 (the overview's command, with `-WorkingDirectory 'C:\Projects\alloy-power-lab\packages\client'`). Open `http://localhost:5288/delve/lab` and choose **Runes**. Once the progress bar fills, the table lists rows like `echo · bolt · fire · III` with a "× none" column (Echo on a Bolt about ×1.4), and each baseline row reads "—". Stop the server afterwards.
