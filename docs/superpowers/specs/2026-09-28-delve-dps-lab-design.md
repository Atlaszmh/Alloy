# Delve DPS Lab Design

**Date:** 2026-09-28
**Status:** Draft.

**Engine** (`packages/engine/`):
- `src/arpg/dps-sim.ts` (new), `src/index.ts`
- `src/arpg/combat.ts`, `src/arpg/step.ts`, `src/arpg/world.ts`, `src/types/arpg.ts` (hit attribution only)
- `tests/delve-dps-sim.test.ts` (new)

**Client** (`packages/client/src/`):
- `pages/DelveLab.tsx` (new)
- `features/delve/lab/` (new): `lab-worker.ts`, `lab-model.ts`, `LabChart.tsx`, `LabTable.tsx`, `dev-routes.tsx`, and their tests
- `App.tsx`, `pages/DelveTraining.tsx`, `components/AppShell.tsx`

## Goal

A developer-only view for balancing. It simulates baseline DPS over time for two kinds of combo:
- every basic-attack combo: weapon × element pair;
- every ability combo: form × elements × weight × payment.

Each combo assumes the player just holds the button, with no gear or modifiers beyond a plain weapon. The results appear as a ranked table and a DPS-over-time chart of the chosen rows.

## Decisions

| Question | Decision |
|---|---|
| Where | An in-game dev page, `/delve/lab`, reached from the Training Grounds, in dev builds only. |
| What a combo is | Basics and abilities apart, in two views. |
| Targets | One dummy by default; a toggle re-runs everything against a clump of 5. |
| Baseline hero | Plain gear at a chosen depth (a slider, 1–30). |
| Ability mana | Real play: basics swing automatically and feed mana, and only the ability's own damage counts, including its damage over time and reaction splash. |
| Positions | Held in place. The hero and dummies are put back every tick, so knockback, pulls and recoils don't drift them apart. |
| Showing hundreds of combos | A ranked table, plus a chart of the ticked rows (top 8 by default). |
| Running | One background Web Worker, restarted for each new request. The whole grid takes about 2 s for one dummy and 5 s for the pack. |
| Setups | Any loadout, labelled by its dimensions, so the sim, table and chart don't know the build model. Only `dpsCombos` is re-enumerated when builds change (the coming moves-and-chains refactor). |

## Engine

### Hit attribution (events only; no rule changes)

Today damage over time and reaction splash carry no ability slot, so an ability's burn, poison and Overload or Combust splash can't be credited to it. Two changes fix that:

- **Splash:** `react()` passes the triggering hit's `opts.slot` to its splash hits (Overload's blast, Combust's blast).
- **Damage over time:** `StatusState` gains `burnSlot` and `poisonSlot` (`number | undefined`, starting undefined in `emptyStatus()`).
  - `applyStatus` takes the applying hit's slot, passed from `hitMonster`'s status loop as `opts.slot`, and records it when it sets the status's damage: when the status wasn't active, or the new damage is at least the current one (`if (!active || dps >= s.burnDps) s.burnSlot = slot`, and the same for poison). A weaker refresh (a basic re-burning a foe an ability burned harder) keeps the stronger applier's slot, since the tick still deals its damage.
  - The burn and poison ticks in `step.ts` put that slot on their `hit` event.
  - Spreading copies it: Blight/Plague's `spreadAffliction` for poison, and Fire mastery's corpse flames for burn.

`source` doesn't change, so the Training meter (which buckets `dot` and `reaction` by source first) reads exactly as before.

### `arpg/dps-sim.ts`

It is pure and deterministic, and built on the Training Grounds sandbox.

```ts
/** One run: a whole loadout, labelled by the dimensions the lab filters and colours by. */
interface DpsSetup {
  view: 'basic' | 'ability';
  /** Filterable dimensions in display order, e.g. { weapon, primary, secondary } or { form, first, second, weight, payment }. Values are short ids; a missing element is 'none'. */
  dims: Record<string, string>;
  weapon: { baseId: string; primary: ManaType; secondary: ManaType | null };
  abilities: AbilityBuilds;
  /** The button held: the basic attack, or an ability slot. */
  hold: 'attack' | { slot: number };
}

interface DpsOptions { depth: number; pack: boolean }

interface DpsResult {
  /** Average DPS so far (damage ÷ elapsed), every 0.5 s (15 ticks): index i is at (i + 1) × 0.5 s. 60 samples. */
  series: number[];
  /** The last sample: DPS over the whole 30 s. */
  dps: number;
  /** How often the held button acted: `basic` events (strikes) for `hold: 'attack'`, casts of that slot for `hold: { slot }`. 0 means it never could, e.g. an unaffordable ability. */
  casts: number;
}

const DPS_SECONDS = 30;
function simulateDps(registry: DataRegistry, setup: DpsSetup, o: DpsOptions): DpsResult;
function dpsCombos(registry: DataRegistry): DpsSetup[];
/** A stable key: the view, then the `dims` values in order, e.g. `basic|sword|fire|none`, `ability|bolt|fire|storm|2|mana`. */
function dpsKey(setup: DpsSetup): string;
```

The setup carries the whole loadout, so `simulateDps` never reads the build model. When builds become chains of moves, `dpsCombos` changes and nothing else does, and a "your builds" view later is one function from the profile.

**Baseline hero.**
- The weapon is `sandboxWeapon(registry, { baseId: setup.weapon.baseId, mana: primary, rarity: 'common', ilvl: depth })`, the Training Grounds' own maker. Its item level is the depth, as in real drops.
- Nothing else is equipped, and there are no legendaries.
- Stats come from `computeHeroStats({ weapon }, registry, { pair: { primary, secondary } })`, unfiltered, as the sandbox's basics-only pair does.
- `dpsCombos` gives every ability setup a plain sword and the pair `{ primary: elements[0], secondary: elements[1] ?? null }`, just as the game limits abilities to the pair.
- The run starts as a fresh floor does: mana full, ability charge 0, cooldowns ready. Mana payments therefore front-load. The chart's early seconds show that, and it is intended.

**Arena.**
- `createSandboxWorld(registry, { depth, stats, abilities, toggles })` with every toggle off.
- The dummies are neutral (`element: null`): the `'single'` layout, or the 5-dummy `'clump'`. The group is shifted as a whole so the nearest dummy's edge sits 0.4 units from the hero's edge, straight ahead.
- The abilities are `setup.abilities`.

**Holding the button.**
- `move: {0, 0}` every tick.
- **`hold: 'attack'`:** `attack: true, attackAim: <the nearest dummy>`.
- **`hold: { slot }`:** `cast: { slot, aim: <the nearest dummy> }`, with `attack` undefined, so basics swing automatically, as in the game.
  - A press the engine refuses (no mana) is dropped and pressed again next tick. A press on cooldown waits, and a wind-up is never restarted.
  - Holding a cast-paid Primary cancels basic swings in their startup, so its runs get little mana from basics. That is real engine behaviour.

**Holding positions.** After every `stepWorld`:
- the hero goes back to its start;
- each dummy goes back to its spot;
- their knockback velocity (`kbx`, `kby`) is zeroed.

Pushes are placed by progress from their own start (`action.ts`), so lunges, step-ins and recoils still take their time and still block swings. Only the drift is removed. Knockback, pulls and crowd control therefore count for nothing in the lab. Dummies never act, so crowd control never mattered here anyway.

**Counting.** The sim sums the `hit` events' `amount`:
- **`hold: 'attack'`:** every hit. No ability is pressed, so everything is the basic attack's, including its burn or poison and any reaction.
- **`hold: { slot }`:** every hit whose `slot` is that slot. That covers direct hits, chains, ticks, its reaction splash, and damage over time from statuses it applied (see attribution above). Basic hits don't count, and neither does damage over time from statuses the basics applied.

**Determinism.** Every run uses the sandbox's fixed world seed. The same setup and options give the same result.

**The grid** (`dpsCombos`):
- **Basics** (252): every weapon base × 6 primaries × (no secondary, or each of the 5 others). Each is `{ view: 'basic', dims: { weapon, primary, secondary }, weapon: { baseId, primary, secondary }, hold: 'attack' }` with `defaultAbilities(primary)`.
- **Abilities** (4,320): every form whose slot is Primary or Ultimate × 36 element sets × 5 weights × 3 payments.
  - Forms: today that is 8 (Bolt, Volley, Lance, Burst, Strike, Nova, Barrage, Maelstrom), read from `arpg.json`, so a new form joins by itself.
  - Element sets: the 6 singles and the 30 *ordered* pairs. The first element is the damage element and decides the reactions, so Fire+Storm and Storm+Fire are different builds.
  - Defensive forms are left out.
  - Each is `{ view: 'ability', dims: { form, first, second, weight, payment }, weapon: { baseId: 'sword', primary: first, secondary: second ?? null }, hold: { slot } }`, where `slot` is `ABILITY_SLOTS.indexOf(form.slot)` and `abilities` is `defaultAbilities(first)` with that slot replaced by the build.
  - Combos a plain hero can never afford stay in the grid with `casts: 0`, for example a mana-paid Heavy or Crushing Ultimate (78 and 96 mana against a pool of about 63).

## Client: the DPS Lab

**Reaching it.**
- `features/delve/lab/dev-routes.tsx` exports `DEV_LAB = import.meta.env.DEV ? lazy(() => import('../../../pages/DelveLab')) : null`. That is created at module scope, so a production build drops the page.
  `lazy` needs a default export and the pages use named ones, so it is `lazy(() => import(...).then((m) => ({ default: m.DelveLab })))`.
- `App.tsx` renders `{DEV_LAB && <Route path="/delve/lab" element={<Suspense fallback={null}><DEV_LAB /></Suspense>} />}`.
- The Training Grounds' top bar gains a 📈 **DPS Lab** button (`training-lab`), shown only when `import.meta.env.DEV`.
- `AppShell` hides the TabBar on `/delve/lab`, as it does on `/delve/training`.

**The page** (`pages/DelveLab.tsx`):
- **Top bar:**
  - Back to the Training Grounds (`data-pad-back`);
  - the **Basics | Abilities** tabs;
  - a **Depth** slider, 1 to `MAX_DEPTH` (30, from the sandbox store), default 10;
  - a **Pack of 5** switch;
  - a **Colour by** select. "Line" is the default and gives each line its own colour; the other choices are the view's `dims` keys.
- **Filter chips:** one group per key in the view's `dims`, in order, with a chip per distinct value in the grid (today: weapon, primary, secondary for basics; form, first, second, weight, payment for abilities). Nothing in the client names a dimension. All start on, and they narrow the table and chart instantly.
- **Progress bar:** shown while the worker runs.

**Running.**
- The page runs the grid for both views at the current depth and pack: on load, when the depth slider is released, and when Pack is switched.
- A new request terminates the worker and starts a fresh one. There are no run ids, because a synchronous worker can't see a newer message mid-run.
- `lab-worker.ts` posts results in batches of 50, as `{ key, setup, result }`.
- `lab-model.ts` keeps them for the session in a map keyed by `depth|pack|dpsKey`, so flipping back is instant.

**Table** (`LabTable.tsx`):
- It lists every result that passes the filters, ranked by `dps`.
- The columns are the `dims` keys, then DPS, shown as a number and a bar scaled to the top row.
- Rows with `casts: 0` (the held button never acted: an unaffordable ability) sit at the bottom, greyed, labelled "can't afford".
- Each row has a checkbox that decides whether it is charted. The top 8 start ticked; a filter change resets the ticks to the new top 8.

**Chart** (`LabChart.tsx`):
- Plain SVG, with no new dependency, and its own axes.
- x runs over 0–30 s. y runs from 0 to the highest charted sample from 3 s onward, rounded up; earlier samples above that are clipped at the top edge.
- There is one path per ticked row.
  - Colour by "Line" uses an 8-colour categorical palette.
  - A value that is a mana type uses `manaStyles(registry)[m].color` (from `features/delve/format.ts`), and `'none'` is stone grey.
  - The other dimensions use the categorical palette.
- A legend, and a hover crosshair that reads out the time and each line's DPS.

**Model helpers** (`lab-model.ts`, pure and unit-tested): the dimension groups derived from a grid's `dims`, the filter predicate, ranking (unaffordable rows last), the top-N ticks, and the colour lookup.

## Testing

**Engine:**
- **Attribution:**
  - An ability's Overload splash hits carry its slot.
  - A burn applied by a slot ticks with that slot, and a basic's burn ticks with none.
  - A spread poison keeps its slot.
  - The attributed hits keep their `source` (`dot`, `reaction`), which is what the Training meter buckets by.
- **`dpsCombos`:** 252 basics and 4,320 abilities, and every `dpsKey` is unique.
- **Determinism:** the same setup gives the same result twice.
- **Basics:**
  - Every weapon base deals damage (`dps > 0`) and strikes (`casts > 0`), with 60 samples.
  - A Fire basic run counts its burn ticks: it is above the same run's direct hits alone.
- **Positions hold:** an Earth Bolt run (whose knockback would push the dummy out of reach within about 10 s) keeps dealing damage. Its middle 10 s DPS is above half its whole-run DPS, and its last 10 s is within 25% of its middle 10 s. (`series` is a running average, so a window's DPS is `(series[j]·t_j − series[i]·t_i) / (t_j − t_i)`.)
- **Ability counting:**
  - A mana-paid Crushing Nova returns `casts: 0` and `dps: 0` while basics swing, which proves basic hits aren't counted.
  - A Fire+Storm Bolt run with `pack: true` includes its Overload splash. (Splash never hits the foe that reacted, so a single dummy takes none.)
- **Pack:** a Frost, Balanced (weight 0), mana-paid Nova does more with `pack: true` than without, by a larger ratio than the same Bolt.
- **Depth:** a deeper depth gives more DPS.

**Client:**
- **`lab-model`:** the dimension groups from `dims`, the filter, the ranking (unaffordable last), the top-8 ticks and the colours.
- **`DelveLab`**, with `vi.stubGlobal('Worker', FakeWorker)` posting fixed results:
  - it renders the chips and ranked rows;
  - a chip narrows the rows;
  - the chart draws one `path` per ticked row;
  - an unaffordable row shows "can't afford".
- **`dev-routes`:** `DEV_LAB` is null when `import.meta.env.DEV` is false (set it false, `vi.resetModules()`, then import the module again, since `DEV_LAB` is made at module scope). The `training-lab` button renders only in DEV, tested on the button alone, so the test doesn't pull in Pixi.

**Release:**
- No version bump: the lab exists only in dev builds, and the attribution change alters no rules and nothing a player sees.
- A CLAUDE.md line on the lab: its route, `dps-sim.ts`, the baseline it assumes, and that positions are held.
