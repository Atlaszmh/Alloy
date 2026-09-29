# Delve DPS Lab Design

**Date:** 2026-09-28
**Status:** Draft.

**Engine** (`packages/engine/src/`): `arpg/dps-sim.ts` (new), `index.ts`, `tests/delve-dps-sim.test.ts` (new).

**Client** (`packages/client/src/`):
- `pages/DelveLab.tsx` (new)
- `features/delve/lab/` (new): `lab-worker.ts`, `lab-model.ts`, `LabChart.tsx`, `LabTable.tsx`, plus tests
- `App.tsx`, `pages/DelveTraining.tsx`, `components/AppShell.tsx`

## Goal

A developer-only view for balancing. It simulates a baseline DPS over time for every basic-attack combo (weapon × element pair) and every ability combo (form × elements × weight × payment). Each assumes the player just holds the button, with no gear or modifiers beyond a plain weapon. The combos are shown in a ranked table, with a DPS-over-time chart of the chosen ones.

## Decisions

| Question | Decision |
|---|---|
| Where | An in-game dev page, `/delve/lab`, reached from the Training Grounds. It exists only in dev builds. |
| What a combo is | Basics and abilities are kept apart, in two views. |
| Targets | One dummy by default, with a toggle to re-run everything against a clump of 5. |
| Baseline hero | Plain gear at a chosen depth (a slider). |
| Ability mana | Real play: basics swing automatically and feed mana, and only the ability's own damage counts. |
| Showing hundreds of combos | A ranked table plus a chart of the ticked rows (the top 8 by default). |
| Running | One background Web Worker. A 30 s run takes under 1 ms, so the whole grid takes seconds. |

## Engine: `arpg/dps-sim.ts`

It is pure and deterministic, built on the Training Grounds' sandbox.

```ts
type DpsSetup =
  | { kind: 'basic'; baseId: string; primary: ManaType; secondary: ManaType | null }
  | { kind: 'ability'; form: FormId; elements: ManaType[]; weight: AbilityWeight; payment: Payment };

interface DpsOptions { depth: number; pack: boolean; seconds?: number /* 30 */ }

interface DpsResult {
  /** Average DPS so far (damage ÷ elapsed time), sampled every `DPS_SAMPLE` (0.25 s); index i is at (i + 1) × 0.25 s. */
  series: number[];
  /** The last sample: DPS over the whole run. */
  dps: number;
}

function simulateDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult;
function dpsCombos(registry: DataRegistry): DpsSetup[];
```

**Baseline hero.**
- The weapon comes from `sandboxWeapon(registry, { baseId, mana: primary, rarity: 'common', ilvl: depth })`, the Training Grounds' own weapon maker. Nothing else is equipped, and there are no legendaries.
- Stats come from `computeHeroStats({ weapon }, registry, { pair: { primary, secondary } })`. That is the pair the combo names, unfiltered, like the sandbox's basics-only pair.
- An ability run uses a plain sword (`baseId: 'sword'`), with the pair `{ primary: elements[0], secondary: elements[1] ?? null }`, just as the game limits abilities to the hero's pair.

**Arena.**
- The arena is `createSandboxWorld(registry, { depth, stats, abilities, toggles })` with every toggle off: real mana and real cooldowns. Invulnerable doesn't matter, since dummies never attack.
- The dummies are neutral (`element: null`): either one dummy, or the 5-dummy `'clump'` layout. They are moved so the nearest one's edge sits `DPS_GAP` (0.4 units) in front of the hero, inside every weapon's reach. Each dummy's `homeX`/`homeY` is updated so it stays there.
- The abilities are `defaultAbilities(primary)`. For an ability run, the ability's own slot (its form's slot) is replaced by `{ form, elements, weight, payment }`.

**Holding the button.** The hero never moves (`move: {0, 0}`); lunges, step-ins and recoils still happen.
- **Basics:** every tick sends `attack: true, attackAim: <the nearest dummy's position>`.
- **Abilities:** every tick sends `cast: { slot, aim: <the nearest dummy's position> }`. `attack` is left undefined, so basics swing automatically, as in the game. The engine casts whenever the slot is ready and affordable. What happens to a press it can't cast (a refused cast, or a buffered one) is whatever the engine already does.

**Counting.** The run steps `stepWorld` at 1/30 s for `seconds` and sums the `hit` events' `amount`:
- basics: every `hit` whose `source` is `'basic'`;
- abilities: every `hit` whose `slot` is the ability's slot, including reaction hits that carry that slot. Basic hits don't count toward an ability.

**Determinism.** A fixed world seed (the sandbox's), so crits are the same each time. The same setup and options give the same result.

**The grid** (`dpsCombos`):
- **Basics** (252): every weapon base × 6 primaries × (no secondary, plus each of the 5 others).
- **Abilities** (2,520): every form whose slot is Primary or Ultimate × 21 element sets (6 singles and 15 pairs, pairs in `MANA_TYPES` order) × 5 weights × 3 payments.
  - Today that is 8 forms: Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom.
  - It reads the forms from `arpg.json`, so a new form joins by itself.
  - Defensive forms are left out.

## Client: the DPS Lab

**Reaching it.**
- `App.tsx` adds `<Route path="/delve/lab" …>` only when `import.meta.env.DEV`, lazy-loaded so a production build doesn't bundle it.
- The Training Grounds' top bar gains a 📈 **DPS Lab** button (`training-lab`), also only in dev.
- `AppShell` hides the TabBar on `/delve/lab`, as it does on `/delve/training`.

**The page** (`pages/DelveLab.tsx`):
- **Top bar:** Back (to the Training Grounds, `data-pad-back`), the **Basics | Abilities** tabs, a **Depth** slider (1–40, default 10), a **Pack of 5** switch, and a **Colour by** select (any of the view's dimensions).
- **Filter chips:**
  - Basics: weapon, primary, secondary (incl. "none").
  - Abilities: form, element set, weight, payment.
  - All chips start on. Chips narrow the table and the chart instantly.
- **Progress bar:** shown while the worker runs.

**Running.** Changing depth or pack starts the grid in the worker, for both views.
- `features/delve/lab/lab-worker.ts` posts results in batches of 50 as `{ key, setup, result }`.
- `lab-model.ts` holds them in a map keyed by `depth|pack|comboKey` for the session, so flipping back is instant.
- A newer request cancels an older one: the worker checks a run id and drops stale work.

**Table** (`LabTable.tsx`):
- Every result that passes the filters, ranked by `dps`.
- Columns are the view's dimensions plus DPS, shown as a number and a bar scaled to the top row.
- A checkbox per row controls whether it is charted. The top 8 start ticked; after a filter change the ticks reset to the new top 8.

**Chart** (`LabChart.tsx`):
- Plain SVG, no new dependency, with its own axes: x is 0–30 s, y is 0 to the highest charted sample, rounded up.
- One path per ticked row, coloured by the Colour by dimension from a fixed palette. Element dimensions use `MANA_HEX`; the others use a categorical palette.
- A legend, and a hover crosshair that reads out time and each line's DPS.

**Model helpers** (`lab-model.ts`, pure and unit-tested): combo keys, the filter predicate, ranking, the top-N ticks, and the colour lookup.

## Testing

**Engine** (`tests/delve-dps-sim.test.ts`):
- `dpsCombos` gives 252 basics and 2,520 abilities, and every key is unique.
- The same setup gives the same result twice.
- Every weapon base's basic run deals damage (`dps > 0`), and the series has `seconds / 0.25` samples.
- An ability run counts only its own slot. The same run's basic hits are excluded: a Bolt run's DPS is less than basics plus the Bolt.
- A Nova (area) run does more with `pack: true` than without, by a larger ratio than a single-element Bolt's.
- A deeper `depth` gives more DPS, because the weapon's item level scales it.

**Client:**
- `lab-model` covers the filter predicate, ranking, top-8 ticks and colour lookup.
- `DelveLab` is tested with a stubbed worker that posts fixed results. It renders the chips and the ranked rows, a chip narrows the rows, and the chart draws one `path` per ticked row.
- `App` registers `/delve/lab` only when `DEV` is true, and the Training Grounds' `training-lab` button shows only in DEV.

**Release:** v0.44.1 (`chore(client): bump version to 0.44.1`), and a CLAUDE.md line on the lab: its route, `dps-sim.ts`, and the baseline it assumes.
