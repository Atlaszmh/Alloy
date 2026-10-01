# Delve rune costs: each rune's load raises its move's price in its chain's own payment

**Status:** approved design, 2026-10-01. It follows the runes (stage 4b, v0.51.0; `docs/superpowers/specs/2026-09-30-delve-runes-design.md`) and ships as **v0.52.0 with no save change**. The user's decisions are settled; this spec grounds them in the code and settles the details they left open. Every such detail is marked **Decided in the spec**, with a one-line reason, and listed again at the end. The starting loads are set from the runes gate's last measurement (depth 10, eight combat seeds, `gate-final`); the new gate measures them again and the loads are what gets tuned.

## Why
The runes made a move stronger and asked nothing back once socketed: "even high powered runes are too cheap to play. There should be an additional mana cost, cooldown, charge consumption, or combination in order to balance out the power that runes provide. As players gear up … they should have to consider the costs to balance out the power. A fully runed primary should be MUCH more powerful than a rune-less one, but it should also cost more mana to use, forcing the player to consider balancing as they work thru their customizations."

## Decisions (the user's)

| Question | Decision |
|---|---|
| Where the cost lands | **In the chain's own payment** ("follow the payment"): a mana chain pays more mana; a charge chain needs more charge before it fires; a cast chain winds up longer and pays its half-mana more. |
| Per what | **Per rune and per tier**, in `runes.json`: strong runes cost more than utility ones, tier V more than tier I. |
| Basic blows | **Free.** "Leave basics alone for now, as their power isn't really the game-changer that primary or ult abilities are … Cost could be 'using this rune on your basic ability instead of your primary'." |
| How much | **About half the power a rune adds**, "but make sure it's easily tuneable per rune and ability so we can tweak it later". |
| Approach | **Load multiplies the price, all in data** (approach 1): `runes.json` rows gain `load: [I..V]`; `balance.json → delve.runes.load` holds `bySlot`, optional `byForm`, and the `charge` and `cast` conversions. Computed once in `resolveAbility`, so the HUD, Power, the DPS Lab and the autopilot all see it. |
| Shown to the player | The picker and the builder show each rune's "+25% cost" beside its effect; the move's cost line shows the total; the HUD's cost follows. |
| Power and the autopilot | Value runes net of their cost (Power already counts mana cost). |
| Gate | A sustained DPS Lab view (mana starts empty; basics refill it): a fully runed tier-III Primary does clearly more sustained damage than rune-less, but costs 2–3× the mana. The power ceilings are unchanged. |
| Release | v0.52.0; no save change. |

## Design

### The load
A move's **load** is one number, the sum over the runes acting on it:

```
L = Σ  def.load[tier − 1] × bySlot[slot] × (byForm[form] ?? 1)
   over ResolvedAbility.runes
```

- **The runes acting** are exactly `ResolvedAbility.runes`: socketed, known, fitting and not dormant. An empty socket, an unknown id, and a Pierce that `resolveAbility` leaves out on a move that already pierces every foe (an Earth Bolt) add nothing. The builder's dormant marks and the HUD's dots read the same list, so a rune that shows as acting is a rune that is paid for.
- **Decided in the spec: the runes' loads add, they don't multiply.** *"+25% and +30% is +55%" reads the way the picker prints it, and one rune's row can be tuned without the others' moving its effect.*
- One rune's share is `runeLoad(registry, ref, form)` (`loot/runes.ts`): its tier's load × its form's slot factor × its form factor. `resolveAbility` sums it; `runeText` prints it. One function, so the two never disagree.
- **Basic blows have no load.** `computeHeroStats`'s blows are untouched, and `runeText` names no cost for a blow.

### Each payment
`resolveAbility` (`arpg/abilities/resolve.ts`) applies the load where it computes the price today. With `s` the slot's row of `delve.abilities.slots`, `W` the weight row, `w` the move's weight and `q` its `quick` knob, and `C = delve.runes.load`:

| Payment | Today | With the load |
|---|---|---|
| mana | `cost = manaCost` | `cost = manaCost × (1 + L)` |
| charge | `chargeNeed = s.cost × (1 + W.cost × needWeight) × chargeRatio`, `cost = 0` | `chargeNeed × (1 + L × C.charge)`, `cost = 0` |
| cast | `cost = manaCost × castManaMult`, `channel = s.castTime × (1 + W.castTime × w) × q.windup` | `cost = manaCost × castManaMult × (1 + L)`, `channel × (1 + L × C.cast)` |

where `manaCost = s.cost × (1 + W.cost × w) × (1 − manaweaver / 100)`, as today.

- **Decided in the spec: a cast chain's longer wind-up is its channel only; the conjure is untouched.** *The conjure is every payment's (a mana chain conjures too): it is the kind's feel, the step-in's duration (`startPush('stepIn', …, ab.conjure)`) and the anticipation art. The channel is the cast payment's own price, the part only a cast chain pays, so "follow the payment" puts the load there.* `castTime = conjure + channel` grows with it, so the HUD's channel bar, `useInterval`'s cadence and the cooldown (which counts from the press plus the channel, `pay(…, t + ab.channel)`) all follow without a change.
- **Decided in the spec: no cooldown is touched.** The Primary's, the Defensive's and the Ultimate's cooldowns and a charge chain's lockout (`chargeLockout × quick.cooldown`) stay as they are. A Defensive or an Ultimate costs more only through its payment: more mana (a Ward, paid with mana by default), more charge (a Nova, paid with charge by default), or a longer channel. *The user's rule is "follow the payment"; a cooldown is no chain's payment, and Quick already owns the cooldown knob.*
- **Charge.** `chargeCap` is a chain's largest need, so the meter grows to hold the loaded need, and every place that fills or clamps it (`gainCharge`, Galvanize, Nightstalker, the sandbox's fill, `world.ts`'s refresh) follows.
- **Decided in the spec: stacking is one product.** Manaweaver's percentage, `castManaMult` and `(1 + L)` multiply, in that order, so Manaweaver takes its share off the loaded price too. *Every factor in the cost line is a multiplier today; a sum would make Manaweaver worth more on a runed move than its tooltip says.* Manaweaver doesn't touch charge or a channel, as today.
- **Worked example** (a medium Bolt, tier III Echo + Heavy + Linger, `L = 0.25 + 0.30 + 0.50 = 1.05`, factors 1): mana 8 → 16.4; charge need 2.8 → 5.74; cast 4 mana → 8.2 and a channel of 0.35 × 1.2 (Heavy) = 0.42 s → 0.861 s; with Manaweaver 20, mana 8 × 0.8 × 2.05 = 13.12.

### Holds, echoes, Drain and the rest
- **A hold** loads every stage alike (its runes are the move's). Each stage's own mana cost is loaded, and a charge chain's need, already the full charge's at every stage, is loaded once.
  - **Accepted:** a hold in a cast chain absorbs its loaded channel as it absorbs any wind-up today (the charging time counts toward it, `releaseHold`), so a long hold hides most of the longer channel; its loaded mana still pays.
- **An Echo** stays free (`echoTick` pays nothing). Echo's load is its price.
- **Drain's budget is half the move's cost before its load.** `fire` sets `drainLeft[slot] = baseCost(ab) × drainShare`, and Power's `drainPerUse` caps with the same, where `baseCost(ab) = ab.cost / (1 + ab.load)` (a charge move's is 0, as today).
  - **Decided in the spec.** *Drain's cap exists so it can't pay for its own move; a cap that grew with the load would refund half of every rune's price, Drain's own included, and undo the cost the user asked for.*
- **A move the pool can't hold.** A loaded mana move can now cost more than the pool (a heavy mana Ultimate already does, 78 > 60). The builder's existing warning says so ("Needs 160 mana; your pool holds 60." for that heavy Ultimate at `L = 1.05`), and the sim refuses it with `noMana`, as today.
- **Determinism:** the load is arithmetic on resolved numbers; nothing new is rolled.

### The data
- **`runes.json`:** every row gains `load: number[]`, five fractions by tier, beside `tiers`:

  ```json
  { "id": "echo", "…": "…", "load": [0.15, 0.2, 0.25, 0.3, 0.35] }
  ```

  `RuneDefSchema` gains `load: z.array(z.number().min(0)).length(RUNE_TIERS).refine(nonDecreasing, 'load must not fall with tier')`, and `RuneDef` gains `load: number[]`.
  - **Decided in the spec: `load` is required on every row, and never falls with tier.** *A new rune then has to say what it costs ("no rune is free" is the floor below), and the decisions' "tier V more than tier I" is checked at load.*
- **`balance.json → delve.runes.load`:**

  ```json
  "load": {
    "bySlot": { "primary": 1, "defensive": 1, "ultimate": 1 },
    "byForm": {},
    "charge": 1,
    "cast": 1
  }
  ```

  Its schema, inside `delve.runes`:

  ```ts
  load: z.object({
    bySlot: z.object({ primary: z.number().min(0), defensive: z.number().min(0), ultimate: z.number().min(0) }),
    byForm: z.record(z.string(), z.number().min(0)),
    charge: z.number().min(0),
    cast: z.number().min(0),
  }),
  ```

  and `DelveBalance['runes']` gains `load: { bySlot: Record<AbilitySlot, number>; byForm: Partial<Record<FormId, number>>; charge: number; cast: number }`.
  - **Decided in the spec: `byForm` ships as `{}`, a form missing from it is 1, and its keys are checked against `arpg.json`'s forms** (in the runes data test, beside `fits.forms`). *Overrides are optional by entry, not by field, so the type stays a plain record; a misspelled form would otherwise be silently 1.*
  - The four knobs are the user's "tuneable per rune and ability": per rune and tier in `runes.json`, per slot and per form here, and the two conversions say how much of a mana-sized load becomes charge or channel.

### The starting loads
**The rule:** each rune's tier-III load is half its measured tier-III gain over its `none` row, `(ratio − 1) / 2`, **rounded up to the next 0.05**; tiers I, II, IV and V are the tier-III load × 0.6, 0.8, 1.2 and 1.4.
- **Decided in the spec: the gain is the rune's best on the ability forms** (the Primary's and the Ultimate's), the higher of one dummy and the pack, from the runes gate's last single-rune run (`gate-final`; tier III, depth 10, eight seeds). *Basics carry no load, so a rune's worth on a weapon's blows (Widen's 1.80 on an axe, Saturate's 1.34 on an axe) isn't what its load prices; and a player sockets a rune where it shines, so its best showing is its price.*
- **Decided in the spec: rounded up, not to the nearest.** *Rounding up keeps every load at or above half its gain, which is what puts a fully runed Primary's best set at 2× its mana or more (below); the user's "about half" holds within 0.05.*
- **Decided in the spec: the tier steps are × 0.6, 0.8, 1, 1.2, 1.4.** *It is the decisions' own Echo row ([0.15, 0.2, 0.25, 0.3, 0.35]) as a rule, and it roughly tracks the runes' tier tables (Echo 30 → 60%, Heavy +15 → +45%, Guard 3 → 8%).*
- **Decided in the spec: no rune is free: the floor is 0.10 at tier III.** It covers the utility runes (Leech, Guard, Drain: their worth is life and mana, not damage, so the Lab can't size it) and any rune whose ability gain comes to less (Widen, a loss on the dummies: its worth there is reach the clump doesn't show; Saturate, exactly 0.10). *"Utility runes a small fixed load": fixed means set, not measured; it still rises with tier like every load.*

| Rune | Best ability gain (tier III) | Tier-III load | I | II | III | IV | V |
|---|---|---|---|---|---|---|---|
| Split | 1.41 (Volley, pack) | 0.205 → **0.25** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 |
| Multi-shot | 1.25 (Bolt, one) | 0.125 → **0.15** | 0.09 | 0.12 | 0.15 | 0.18 | 0.21 |
| Pierce | 1.95 (Volley, pack) | 0.475 → **0.50** | 0.30 | 0.40 | 0.50 | 0.60 | 0.70 |
| Chain | 1.72 (Volley, pack) | 0.36 → **0.40** | 0.24 | 0.32 | 0.40 | 0.48 | 0.56 |
| Widen | 0.93 (Strike, pack) | floor **0.10** | 0.06 | 0.08 | 0.10 | 0.12 | 0.14 |
| Quick | 1.22 (Nova, pack) | 0.11 → **0.15** | 0.09 | 0.12 | 0.15 | 0.18 | 0.21 |
| Echo | 1.45 (Maelstrom, one) | 0.225 → **0.25** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 |
| Heavy | 1.52 (Barrage, one) | 0.26 → **0.30** | 0.18 | 0.24 | 0.30 | 0.36 | 0.42 |
| Saturate | 1.20 (Barrage, pack) | 0.10 → **0.10** | 0.06 | 0.08 | 0.10 | 0.12 | 0.14 |
| Linger | 1.93 (Nova, pack) | 0.465 → **0.50** | 0.30 | 0.40 | 0.50 | 0.60 | 0.70 |
| Volatile | 1.23 (Strike, pack) | 0.115 → **0.15** | 0.09 | 0.12 | 0.15 | 0.18 | 0.21 |
| Leech | 1.00 (life) | floor **0.10** | 0.06 | 0.08 | 0.10 | 0.12 | 0.14 |
| Drain | 1.36 (Volley; mana) | floor **0.10** | 0.06 | 0.08 | 0.10 | 0.12 | 0.14 |
| Guard | 1.00 (life) | floor **0.10** | 0.06 | 0.08 | 0.10 | 0.12 | 0.14 |

**What it comes to** (the factors at 1). The runes gate's best three-rune set on the pack for each Primary form, at tier III:

| Form | Best set (pack) | Its gain then | `L` | Mana per press | Sustained, if mana-bound (≈ gain ÷ (1 + L)) |
|---|---|---|---|---|---|
| Bolt | Echo + Heavy + Linger | 2.56× | 1.05 | 2.05× | ≈ 1.25× |
| Volley | Pierce + Echo + Heavy | 3.78× | 1.05 | 2.05× | ≈ 1.84× |
| Lance | Echo + Heavy + Linger | 2.40× | 1.05 | 2.05× | ≈ 1.17× |
| Burst | Echo + Heavy + Linger | 2.61× | 1.05 | 2.05× | ≈ 1.27× |
| Strike | Echo + Heavy + Linger | 2.60× | 1.05 | 2.05× | ≈ 1.27× |

The heaviest set anywhere at tier V (Pierce + Linger + Chain on a Bolt) loads 0.70 + 0.70 + 0.56 = 1.96: 2.96× the mana. So tier III's best builds cost about twice and tier V's heaviest about three times: the decisions' 2–3× band, end to end.
- The last column is an estimate, and a pessimistic one: the Lab's held Primary is already mana-bound at full mana (the runes gate found a Volley casting 40 times in 30 s where its beat allowed 52), so a loaded set's sustained ratio is about its gain over its price, and a little more where the rune-less row was less bound than the runed one. **Lance is the form at risk** of the sustained floor below; `byForm.lance` is its lever.

### What each consumer shows or does

**`ResolvedAbility`** (`types/ability.ts`) gains:

```ts
/** Its runes' load (see the rune costs spec): Σ runeLoad over `runes`, before the payment's conversion. 0 without runes. */
load: number;
```

and `resolve.ts` exports `baseCost(ab: ResolvedAbility): number` (`ab.cost / (1 + ab.load)`: the move's mana cost before its load, for Drain's cap).
- **Decided in the spec: `load` is exposed, before the payment's conversion.** *The readout and the gate need the move's total without re-summing its runes, and one number per move serves all three payments (mana and cast cost × (1 + L), charge × (1 + L × charge), channel × (1 + L × cast)).*

**`runeText`** (`loot/runes.ts`) takes the chain's payment and returns the rune's cost:

```ts
export function runeText(
  registry: DataRegistry,
  ref: RuneRef,
  on?: RuneTarget,
  payment?: AbilityPayment,
): { effect: string; tradeoff: string | null; cost: string | null };

/** A load as the player reads it, in the payment's own terms: "+25% cost", "+25% charge", "+25% cast wind-up, +25% cost". */
export function loadText(registry: DataRegistry, load: number, payment?: AbilityPayment): string;
```

- `cost` is `loadText` of the rune's share: with `on` a form, `runeLoad(registry, ref, on.form)`; with no `on`, its tier's raw `load` (no slot or form factor known); with `on` a blow, **null** (blows are free); and null whenever the share comes to 0 (a factor set to 0).
- `loadText`'s words, by payment, with percentages whole (`Math.round(x × 100)`):
  - `'mana'`, or no payment known: "+25% cost";
  - `'charge'`: "+25% charge" (the load × `charge`);
  - `'cast'`: "+25% cast wind-up, +25% cost" (the load × `cast`, then the load).
- **Decided in the spec: "cast wind-up", not "wind-up".** *The load lengthens the channel only; the builder's "0.35s wind-up" is conjure plus channel, so "+25% wind-up" would overstate it. "A cast wind-up" is already the payment's name for it.*
- **Decided in the spec: `payment` is a fourth argument, not a field on `RuneTarget`.** *`RuneTarget` decides fit and dormancy, which payment never touches; widening it would put payment into `runeFits`' signature for nothing.*
- **Decided in the spec: blows show no cost line.** *Free is the absence of a price; the same rune picked for a move shows its price there, which is the trade the user described.*
- The client still never formats a rune's numbers: `loadText` is the one formatter, for a rune's share and for a move's total.

**The rune picker** (`features/delve/runes/RunePicker.tsx`): `RunePickerProps` gains `payment?: AbilityPayment`, passed to `runeText`. `RuneEffect` prints `effect · tradeoff · cost`, the cost in its own colour (the trade-off's amber, `text-amber-200/80`, so the price reads as the price). The builder (`ChainEditor.tsx`) passes the edited chain's payment (none for the basic chain); the stop's rune pick (`StopPanel.tsx`) passes the saved chain's. The Training Grounds use `ChainEditor`, so they show it too. The current rune (Pull) shows it the same way.

**The builder's cost line** (`chains/MoveEditor.tsx`'s `Readout`): the pay string already reads the loaded `ab.cost`, `ab.chargeNeed` and `ab.castTime`. When `ab.load > 0` it appends ` (runes: ${loadText(registry, ab.load, ab.payment)})`: "16 mana · …s wind-up (runes: +105% cost) · 0.45s cooldown, then a …s beat"; "Charge 6 · …s wind-up (runes: +105% charge) · no cooldown, …"; "8 mana · …s wind-up (runes: +105% cast wind-up, +105% cost) · …" (the medium Bolt of the worked example). A hold's "Fully charged" line already shows its loaded price and adds nothing; the pool warning reads the loaded cost and needs no change.

**The HUD:** **no change.** The snapshot's `cost` is `ab.cost`, `affordable` is `canAfford`, `charge` is the meter over `ab.chargeNeed`, and the channel bar spans `conjureUntil → until`: each is already the loaded number. A runed move greys out ("mana") sooner and its charge ring fills slower; that is the cost showing.
- **Decided in the spec: no new HUD element.** *The HUD shows readiness, not prices; the price is the builder's, and the readiness already follows it.*

**Power** (`delve/hero-stats.ts`): **no new term.** `useInterval` already takes the longest of the cooldown (plus the channel), the payment (`cost ÷ mana income`, `chargeNeed ÷ charge rate`) and the cadence (wind-up plus beat), and every one of those is the loaded number. A mana-bound Primary's Power falls by about its `(1 + L)`, so a rune is worth its gain net of its price. The one change: `drainPerUse` caps with `baseCost(ab) × drainShare` (Drain above).

**The autopilot** (`delve/autopilot.ts`): **no code change.** Opening (`openSockets`), socketing (`bestRune`, `socketBest`) and the stop's rune (`runeStop`) all take a rune only when it raises `profilePower`, which now nets its cost: a rune whose load outweighs its gain on a move is never socketed there, and a socket nothing gains from is never opened.

**The Training Grounds:** the prices apply, but the default toggles make mana and charge moot: infinite mana tops the pool up every tick (`canAfford` ignores cost) and no cooldowns keeps every charge chain at its cap. A cast chain's longer channel is time, not a toggle, so it still shows. With the toggles off, the sandbox pays as a dive does. The readout and the picker show the prices either way.

**The DPS Lab** (`arpg/dps-sim.ts`, `pages/DelveLab.tsx`):
- `DpsOptions` gains `sustained?: boolean`: **mana starts empty** (`h.mana = 0`) and every charge meter at 0, right after `createSandboxWorld`. Nothing else changes: the basics swing on their own under a held ability and refill the pool (`basicAttackGain` a strike, plus regen), the held button presses as today, and runes cost what `resolveAbility` says.
- The Lab page gets a "Sustained" checkbox beside "Pack" (`data-testid="lab-sustained"`), passed in the worker's `DpsOptions`; the session's results are kept by `depth|pack|sustained|dpsKey` (`lab-model.ts`'s `remember` / `recall`).
- **Decided in the spec: sustained is an option on every view, like the pack, not a fourth view.** *It is one starting condition, and a separate set of rows would duplicate the rune view's setups; the basic view's rows come out the same with it (a basic attack spends no mana), which the tests pin.*
- **Decided in the spec: 30 s, the same as every run.** *The pool refills from empty within a few casts, so 30 s is mostly the steady state, and one `DPS_SECONDS` keeps the series and the chart one shape.*
- The other views and the full-mana rune view keep their setups; the loads change only the rune view's results (below).

## Balance and gates
- **No runes, no change:** the grid's basic and ability views come out identical, row for row (a move without runes has `L = 0`), and so does every hero's Power without runes (the "Power without runes" tests stand).
- **The power ceilings are unchanged** (one dummy 2.0× a rune and 3.0× a set; the pack 2.5× and 4.0×), measured as before: the full-mana rune view and `runeComboSetups`, now with the loads paid. A load only raises a price, so a ratio can fall where the held button is mana-bound and never rise; the gate is re-run and its numbers recorded, and the five accepted Nova-with-Linger sets (one dummy) are expected to fall.
- **The sustained gate (new).** For each Primary form (Bolt, Volley, Lance, Burst, Strike):
  1. **The fully runed build:** the form's default chain, paid with mana, every move holding the same three runes at tier III: the set with the highest pack ratio in the full-mana rune view among the form's `runeComboSetups` (the existing combo search, run with the loads).
     - **Decided in the spec: "best" is ranked at full mana, as the existing search ranks.** *Ranking by the sustained ratio would pick the cheapest set, and the gate would stop checking what a fully runed build costs.*
  2. **Its sustained DPS** on the pack (`{ pack: true, sustained: true }`, eight seeds) over the rune-less default chain's, on the same elements: **at least 1.2×**. One dummy is measured and reported, not gated.
     - **Decided in the spec: the floor is 1.2× on the pack.** *Under the user's own rule (a load of half the gain), a mana-bound Primary's sustained ratio is about gain ÷ (1 + L); the best pack sets gain 2.40–3.78× at full mana, so at the band's floor of 2× they sustain 1.2–1.9×. 1.2× is the most every Primary form can meet at 2×, and it is "clearly more": a fifth more over a whole fight with the pool running dry, on a build that bursts 2.4–3.8× from a full pool. 1.3× would be out of reach for Lance and at the edge for Bolt, Burst and Strike at 2×.* The pack, because dives fight packs and the sets were ranked there.
  3. **Its mana per press** over the rune-less chain's: the mean `cost` of the resolved chain's moves (a hold at stage 2, as `valuedMove`), runed ÷ rune-less: **between 2.0× and 3.0×**. It is exact arithmetic, `1 + L` when every move holds the same acting runes.
  - The gate is a skipped-by-default vitest file, `tests/delve-rune-costs-gate.test.ts` (`describe.skipIf(!process.env.RUNE_COST_GATE)`), printing a row per form (the set, its full-mana and sustained ratios on both layouts, its mana per press) and failing on a breach. **Decided in the spec: in the repo, not a scratch script.** *The loads will be tuned again; the gate should be one command away for whoever tunes them.*
  - **Decided in the spec: the gate covers mana chains only.** *The Primary's default payment is mana, and the decisions' "costs 2–3× the mana" is a mana statement; `charge` and `cast` start at 1 and are tuned by play.*
- **Tuning order** when the gate fails: the loads, never the ceilings, the floor or the band. First `byForm` for the form that misses (a form whose best set gains less pays less: Lance is expected there), then `bySlot.primary` if every form misses the same way, then the rows of the runes in the failing sets. **If a form can't meet the floor and the band together** (its best set gains less than 1.2 × 2.0 = 2.4× on the pack, sustained), **stop and report the numbers to the user**, as the runes gate did.
- **Measured** after the build goes in the release notes: each form's set and ratios, the singles' and the combos' maxima against the ceilings, and the pacing rails before and after.

## Pacing
- **Before anything changes,** capture v0.51.0's `runAutopilot` numbers at HEAD. The last recorded run (2026-10-01, after the runes fixes, `pacing-fix`): first dives 3, 3, 3, 3 (mean 3; ≥ 3, ≤ 12); dive 6 and dive 12 means 24.25 and 36; Frost dive 1 → 12, 3.5 → 35.5 (≥ dive 1 + 5); legendaries at dive 12, 5.75 (≥ 1, < 12); the own pair's reaction 6 of 6; the 15-pair sweep's median 24 (21–31, allowed 14.4–38.4); seconds a floor 29.80 (8–60).
- **Expected:** runes now drain mana, so the autopilot sockets fewer of them (only where they net Power), its Primaries cast less often where they do, and fights run longer. Dives may get shallower and floors longer; the Links that sockets no longer take go to the 4th and 5th slots.
- **Every rail in `tests/delve-pacing.test.ts` must hold.** If one breaks, **re-tune the loads, not the rails**: `bySlot` first (one number a slot), then the rows of the runes the autopilot socketed most. If no loads that keep the sustained gate's band also hold the rails, stop and report the numbers to the user.

## Where the code changes

| Area | Files | What |
|---|---|---|
| Types | `engine/src/types/rune.ts`, `types/ability.ts`, `types/delve.ts` | `RuneDef.load`, `ResolvedAbility.load`, `DelveBalance['runes']['load']` |
| Data | `engine/src/data/runes.json`, `data/balance.json`, `data/schemas.ts` | the 14 `load` rows, `delve.runes.load`, their schemas |
| Resolve | `arpg/abilities/resolve.ts`, `loot/runes.ts` (`runeLoad`) | `L`, the three prices, `load`, `baseCost` |
| Sim | `arpg/abilities/cast.ts` | Drain's budget from `baseCost` |
| Power | `delve/hero-stats.ts` | `drainPerUse`'s cap from `baseCost` |
| Lab | `arpg/dps-sim.ts`, `client/src/pages/DelveLab.tsx`, `client/src/features/delve/lab/lab-model.ts` | `DpsOptions.sustained`, the checkbox, the session key |
| Gate | `engine/tests/delve-rune-costs-gate.test.ts` (new) | the sustained gate, skipped by default |
| Texts | `loot/runes.ts` | `loadText`, `runeText`'s `payment` and `cost` |
| Client | `features/delve/runes/RunePicker.tsx`, `chains/ChainEditor.tsx`, `chains/MoveEditor.tsx`, `StopPanel.tsx` | the picker's cost, the payment passed in, the readout's runes note |
| Docs | `CLAUDE.md`, `packages/client/package.json` | the Runes and DPS Lab bullets, v0.52.0 |

Unchanged on purpose: `delve/autopilot.ts`, `useInterval` and `damagePerUse`, `ArenaHud.tsx` and `useArenaCore.ts`, `computeHeroStats`' blows, the save.

## Build
Two agents in parallel worktrees after one contract step, then a finish. A reviewer checks each agent's work, and a final review checks the whole.

### Step 1: the contract (agent A, merged before B starts)
Everything here compiles and leaves every existing test green, but for the expectations the load itself changes (rune-view numbers and a few rune-sim and rune-power tests that compute a price or Drain's cap from `ab.cost`, updated in this step).
- **Types:** `RuneDef.load: number[]`; `ResolvedAbility.load: number`; `DelveBalance['runes']['load']` as in "The data".
- **Data and schemas:** the table's 14 `load` rows; `delve.runes.load` as shipped (`bySlot` all 1, `byForm` `{}`, `charge` 1, `cast` 1); `RuneDefSchema.load` (length 5, ≥ 0, non-decreasing); the `load` schema; the data test's `byForm` keys against the forms.
- **Helpers:**

  ```ts
  // loot/runes.ts (exported whole through `export * from './loot/runes.js'`)
  /** One rune's share of a move's load on `form`: its tier's load × its slot's and its form's factors. */
  export function runeLoad(registry: DataRegistry, ref: RuneRef, form: FormId): number;

  // arpg/abilities/resolve.ts (added to src/index.ts's named list)
  /** A move's mana cost before its runes' load (0 for a charge move): Drain's cap reads it. */
  export function baseCost(ab: ResolvedAbility): number;
  ```

- **`resolveAbility`:** `L` summed over the runes it returns, the three prices, `load: L`.
- A step-1 test file, `tests/delve-rune-costs.test.ts`, owns the resolve tests (Testing).

### A: the engine (after step 1)
`cast.ts`'s Drain budget and `drainPerUse` on `baseCost`; `DpsOptions.sustained` in `dps-sim.ts`; the Lab page's checkbox and session key (A alone owns the Lab, engine and page, as the runes' D did); the gate file; the Power tests' restatement (below); then the gates and the pacing run, tuning loads by the order above and reporting before any rail, ceiling, floor or band would move.
- **Files it owns:** those, `tests/delve-rune-costs.test.ts`, `tests/delve-rune-power.test.ts`, `tests/delve-dps-sim.test.ts`, the gate file, and the data files for tuning.

### B: the texts and the client (after step 1)
`loadText` and `runeText`'s `payment` and `cost` (`loot/runes.ts`, below `runeLoad`, which it doesn't change); `RunePickerProps.payment` and the cost in `RuneEffect`; `ChainEditor` and `StopPanel` passing the chain's payment; the `Readout`'s runes note.
- **Files it owns:** those, and their tests (`features/delve/runes/__tests__/`, `chains/` tests, and the engine's `runeText` tests in `tests/delve-runes-contract.test.ts`).
- **The contract it builds on:** `RuneDef.load`, `DelveBalance['runes']['load']`, `ResolvedAbility.load`, `runeLoad`, from step 1. It reads the shipped loads through the registry and never hard-codes one except in a test that pins the table.
- **Merge points with A:** none in the same function. A never edits `loot/runes.ts` after step 1; B never edits `src/index.ts`, `resolve.ts` or the data files. If A's tuning changes a load B's tests pin, A updates that expectation.

### Finish
The gates' numbers in the release notes, `CLAUDE.md`, and v0.52.0.

## Testing
- **Engine** (`tests/delve-rune-costs.test.ts` unless named):
  - data: every rune has five loads, non-decreasing and ≥ 0; the table's values (one test pins the 14 rows, so a tuning shows in review); `byForm` keys are real forms;
  - `runeLoad`: the tier's load × `bySlot` × `byForm` (a fixture balance with a slot at 0.5 and a form at 2);
  - no runes: every slot, payment, kind and hold stage resolves exactly as before (`load` 0; cost, charge need, conjure, channel and cooldown identical to a v0.51.0 golden);
  - mana: `cost × (1 + L)`; cast: `cost × (1 + L)` and `channel × (1 + L × cast)`, the conjure unchanged; charge: `chargeNeed × (1 + L × charge)` and `cost` 0; no payment's cooldown changes (the charge lockout included); `chargeCap` follows the loaded need;
  - the sum: three runes add; an empty socket, an unknown id and the Pierce on an Earth Bolt add nothing (`runes` and `load` agree);
  - Manaweaver: `8 × 0.8 × (1 + L)`; a hold's stages each loaded;
  - blows: `HeroBlow` unchanged with runes socketed;
  - the sim: a loaded move the pool covers only before its load is refused with `noMana`; Drain's budget is `baseCost × drainShare` (`delve-rune-sim.test.ts`'s Drain tests switch to `baseCost`);
  - Power (`delve-rune-power.test.ts`): with `bySlot` zeroed (a cloned registry) a runed hero's Power is its v0.51.0 value, and with the shipped loads it is lower for a mana-bound Primary; the autopilot opens no Primary socket when `bySlot.primary` is 10. **Decided in the spec: "Drain never costs DPS" becomes "Drain adds DPS on some setup".** *Drain's own load can now outweigh its refund (a one-target Nova: 6 mana of load for 2 back), which is the point.* The `it.fails` direction test (Power against the Lab) stays marked; if the loads make it pass, it becomes an `it`;
  - the Lab (`delve-dps-sim.test.ts`): sustained starts at 0 mana and 0 charge; a basic-view row is the same sustained or not; the basic and ability views' rows are unchanged; a runed rune-view row's casts fall sustained.
- **Client:**
  - `runeText` (engine, B): "+25% cost" for Echo III on a Bolt paid with mana, "+25% charge" with charge, "+25% cast wind-up, +25% cost" with cast; the factors applied with a form; the raw load with no target; null on a blow and at a 0 share;
  - `RunePicker`: the cost after the effect and trade-off, per payment; none for a blow;
  - `Readout`: the runes note per payment; no note without runes; the pool warning on a loaded cost;
  - the Lab's sustained checkbox and its session key (A).
- **E2E:** none new; every Delve spec passes.

## Docs and version
- **`CLAUDE.md`, the Runes bullet:** a sentence on costs: each rune's `load` (by tier, `runes.json`) adds up over the runes acting on a move (`runeLoad`, `ResolvedAbility.load`) and raises its price in its chain's payment in `resolveAbility` (mana and a cast's mana × (1 + L), charge need × (1 + L × `charge`), a cast's channel × (1 + L × `cast`); no cooldown; blows free); the factors in `balance.json → delve.runes.load`; `loadText` / `runeText`'s `cost` the only formatter; Drain's cap on `baseCost`; Power and the autopilot net it through `useInterval`; the sustained gate's numbers. The spec path joins the Delve section's spec list.
- **The DPS Lab bullet:** the "Sustained" option (`DpsOptions.sustained`: mana and charge start empty).
- **Version:** `chore(client): bump version to 0.52.0`. No save change: the load is data, and a socketed rune is still `{ id, tier }`.

## Open questions
These don't block the build; each is for the gate or for play.
- **Lance and the floor.** Its best set is expected near 1.17× sustained at 2.05× the mana; `byForm.lance` is the lever, and the gate decides.
- **Charge and cast conversions.** Both start at 1 and the gate doesn't cover them. A charge Ultimate (a Nova) at `L ≈ 1` needs about twice the charge; whether that feels like the same price as twice the mana is play's call.
- **Basic blows.** Free by the user's call; if runed basics outpace runed abilities in play, a blow load is one more factor (`bySlot.basic`).
- **The full-mana ceilings.** The loads should pull the five accepted Nova-with-Linger sets down on one dummy; if they come under 3.0×, the accepted exception can be dropped from the docs.

## Decided in the spec (index)
1. The runes' loads add over the runes acting on a move (`ResolvedAbility.runes`); empty, unknown and dormant sockets, and Pierce on an infinite pierce, add nothing.
2. A cast chain's longer wind-up is its channel only; the conjure is untouched.
3. No cooldown is touched, the charge lockout included; a Defensive or an Ultimate costs more only through its payment.
4. Stacking is one product: Manaweaver's percentage × `castManaMult` × (1 + L); Manaweaver doesn't touch charge or channel.
5. A hold loads every stage alike; a cast hold's charging time absorbs its loaded channel as any wind-up (accepted).
6. Echoes stay free; Echo's load is its price.
7. Drain's budget is half the move's cost before its load (`baseCost`), in the sim and in Power.
8. `load` is required on every rune row and never falls with tier.
9. `byForm` ships as `{}`, a missing form is 1, and its keys are checked against the forms.
10. Starting loads: half the rune's best tier-III gain on the ability forms (the higher of one dummy and the pack), rounded up to the next 0.05.
11. Tier steps × 0.6, 0.8, 1, 1.2, 1.4 of tier III (the decisions' Echo row as a rule).
12. No rune is free: a floor of 0.10 at tier III, which Leech, Guard, Drain, Widen and Saturate take.
13. `ResolvedAbility.load` is exposed, before the payment's conversion; `baseCost(ab)` is exported.
14. `runeText` takes the payment as a fourth argument and returns `cost`; `loadText` is the one formatter; whole percentages.
15. The words: "+N% cost" (mana or unknown), "+N% charge", "+N% cast wind-up, +N% cost".
16. Blows show no cost line (null).
17. The builder's pay line appends "(runes: …)" from `loadText` when the load is above 0; nothing else in the readout changes.
18. No new HUD element: its readiness already reads the loaded numbers.
19. Power and the autopilot get no new term or policy: `useInterval` nets the price; only `drainPerUse`'s cap changes.
20. The Training Grounds pay, but their default toggles make mana and charge moot; a cast's channel still shows.
21. Sustained is a `DpsOptions` flag on every view (mana and charge start at 0), with a Lab checkbox, not a fourth view; 30 s as every run.
22. The ceilings and their gate are unchanged and re-run with the loads at full mana.
23. The sustained gate: each Primary form's best three-rune set by the full-mana pack ratio; sustained on the pack at least 1.2× rune-less; mana per press 2.0–3.0× (from the resolved chain); one dummy reported.
24. The gate lives in the repo, skipped unless `RUNE_COST_GATE` is set, and covers mana chains only.
25. Tuning order: `byForm`, then `bySlot`, then rune rows; never the ceilings, the floor, the band or the pacing rails; report when loads can't meet them.
26. "Drain never costs DPS" becomes "Drain adds DPS on some setup"; the `it.fails` direction test stays until it passes.
27. The build: a contract step (types, data, `runeLoad`, `resolveAbility`, `baseCost`), then A (engine, the Lab end to end, gates, pacing) and B (texts and client) in parallel.
