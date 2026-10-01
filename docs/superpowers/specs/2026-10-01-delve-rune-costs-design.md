# Delve rune costs: each rune's load raises its move's price in its chain's own payment

**Status:** approved design, 2026-10-01. It follows the runes (stage 4b, v0.51.0; `docs/superpowers/specs/2026-09-30-delve-runes-design.md`) and ships as **v0.52.0 with no save change**. The user's decisions are settled; this spec grounds them in the code and settles the details they left open. Every such detail is marked **Decided in the spec**, with a one-line reason, and listed again at the end. The starting loads come from the runes gate's last measurement (depth 10, eight combat seeds, `gate-final`). The new gate measures them again, and the loads are what gets tuned. **Revised after the spec** (the user's change to the gate, and the review): every change is marked **(revision)**, here and in the index. **Revised again** (the user's choice, "Attunement eases rune cost"): every change is marked **(revision 2)**. The predicted ratios below come from a prototype of the gate. It ran the shipped sim (v0.51.0's build) with each runed chain's mana costs scaled by its eased load, and it reproduces the runes gate's unloaded ratios exactly.

## Why
The runes made a move stronger and asked nothing back once socketed. In the user's words: "even high powered runes are too cheap to play. There should be an additional mana cost, cooldown, charge consumption, or combination in order to balance out the power that runes provide. As players gear up … they should have to consider the costs to balance out the power. A fully runed primary should be MUCH more powerful than a rune-less one, but it should also cost more mana to use, forcing the player to consider balancing as they work thru their customizations." **(revision)** And on the gate: "It should be something the player needs to plan or build around. Want a strong ability? Better make sure your gear and mana can support it." **(revision 2)** The first prototype showed half-gain loads leaving a starved runed Primary 1.4–1.9× ahead, with support adding only 0.24–0.39. So the user chose to make support itself the lever: attunement eases a rune's cost.

## Decisions (the user's)

| Question | Decision |
|---|---|
| Where the cost lands | **In the chain's own payment** ("follow the payment"). A mana chain pays more mana. A charge chain needs more charge before it fires. A cast chain winds up longer and pays more of its half-mana. |
| Per what | **Per rune and per tier**, in `runes.json`. Strong runes cost more than utility ones, and tier V costs more than tier I. |
| Basic blows | **Free.** "Leave basics alone for now, as their power isn't really the game-changer that primary or ult abilities are … Cost could be 'using this rune on your basic ability instead of your primary'." |
| How much | **About half the power a rune adds**, "but make sure it's easily tuneable per rune and ability so we can tweak it later". **(revision 2)** Superseded: loads roughly double, so a starved build sustains about 0.9–1.2× (a trap), and attunement eases them. |
| Easing **(revision 2)** | **Attunement eases rune cost.** Each point of attunement in the move's element(s) (the average for two, as `attunePower` does) takes `easePerAttune` (start 0.03) off its load, at most `easeCap` (start 0.6). Both live in `balance.json → delve.runes.load`. A starved hero pays about full price; a supported one (about 15 attunement) about half. Rune-less heroes are untouched, and basics stay free. The texts show the eased cost, and the builder says how much attunement eases it. |
| Approach | **Load multiplies the price, all in data** (approach 1). `runes.json` rows gain `load: [I..V]`. `balance.json → delve.runes.load` holds `bySlot`, an optional `byForm`, and the `charge` and `cast` conversions. The load is computed once, in `resolveAbility`, so the HUD, Power, the DPS Lab and the autopilot all see it. |
| Shown to the player | The picker and the builder show each rune's "+25% cost" beside its effect. The move's cost line shows the total, and the HUD's cost follows. |
| Power and the autopilot | Both value runes net of their cost (Power already counts mana cost). |
| Gate **(revision)** | A sustained DPS Lab measurement (mana starts empty; basics refill it) of **two builds** per Primary form, each comparing the best three-rune tier-III set against rune-less. **Starved:** starting-level mana support, with no floor (report only). **Supported:** high attunement, mana-focused gear and Drain; the runed Primary must sustain **≥ 1.5×** rune-less. "The gap between the two is the point." **(revision 2)** Starved should land about 0.9–1.2×. The power ceilings are unchanged. |
| Mana support readout **(revision)** | The builder shows a chain's mana spend a second at its cadence against the build's refill a second (basics + regen + Drain): "Spends 14/s · your build refills 9/s". The engine computes both numbers in one helper, and the client shows them. |
| Release | v0.52.0; no save change. |

## Design

### The load
A move's **load** is one number: the sum over the runes acting on it, eased by the move's attunement **(revision 2)**.

```
raw  = Σ  def.load[tier − 1] × bySlot[slot] × (byForm[form] ?? 1)
        over ResolvedAbility.runes
ease = min(easeCap, easePerAttune × avgAttune)
load = raw × (1 − ease)
```

`avgAttune` is the mean of `stats.attunement` over the move's elements: the same number `resolveAbility` already computes for `attunePower`. In a dive it is the pair-filtered attunement (`profileStats`).

- **The runes acting** are exactly `ResolvedAbility.runes`: socketed, known, fitting and not dormant. These add nothing: an empty socket; an unknown id; a Pierce that `resolveAbility` leaves out on a move that already pierces every foe (an Earth Bolt).
  - The builder's dormant marks, the picker's prices and the HUD's dots all read the same list. So a rune that shows as acting is a rune that is paid for.
- **Decided in the spec: the runes' loads add, they don't multiply.** *"+25% and +30% is +55%" reads the way the picker prints it, and one rune's row can be tuned without the others moving its effect.*
- One rune's share is `runeLoad(registry, ref, form)` (`loot/runes.ts`): its tier's load × its form's slot factor × its form factor, before easing. `resolveAbility` sums it, and `runeText` prints it. One function computes both, so they never disagree.
- **Easing (revision 2).** `loadEase(registry, stats, elements): number` (`loot/runes.ts`) returns `ease`. `resolveAbility` applies it to the sum, and `runeText` applies it to one rune's share when the move's ease is known.
  - **Decided in the spec (revision 2): easing multiplies the sum, once.** *Easing is a property of the move (its elements and the hero), not of any one rune, so one factor on the total keeps every rune's share in proportion. "Attunement eases rune cost by 45%" then means exactly that.*
  - **Decided in the spec (revision 2): the move's elements, averaged, as `attunePower`.** *A move's attunement already sets its power. The same number easing its cost makes "attune to what you rune" one plan, and a fusion move eases by its two elements' mean, as it powers.*
  - **Decided in the spec (revision 2): `easePerAttune` 0.03 and `easeCap` 0.6.** *The user's starting values. The cap is reached at 20 attunement; a starting hero (attunement 1) is eased 3%, and the supported build (15) 45%. The prototype holds both targets with them (Balance and gates).*
- **(revision) In `resolve.ts` the variable is `load`.** `L` is already the hero's legendaries there.
- **Basic blows have no load.** `computeHeroStats`'s blows are untouched, and `runeText` names no cost for a blow.
- **Rune-less moves are untouched:** `raw` is 0, so `load` is 0 at any attunement.

### Each payment
`resolveAbility` (`arpg/abilities/resolve.ts`) applies the load where it already computes the price. Notation:
- `s`: the slot's row of `delve.abilities.slots`;
- `W`: the weight row;
- `w`: the move's weight;
- `q`: its `quick` knob;
- `C`: `delve.runes.load`.

| Payment | Today | With the load |
|---|---|---|
| mana | `cost = manaCost` | `cost = manaCost × (1 + load)` |
| charge | `chargeNeed = s.cost × (1 + W.cost × needWeight) × chargeRatio`, `cost = 0` | `chargeNeed × (1 + load × C.charge)`, `cost = 0` |
| cast | `cost = manaCost × castManaMult`, `channel = s.castTime × (1 + W.castTime × w) × q.windup` | `cost = manaCost × castManaMult × (1 + load)`, `channel × (1 + load × C.cast)` |

Here `manaCost = s.cost × (1 + W.cost × w) × (1 − manaweaver / 100)`, as today.

- **Decided in the spec: a cast chain's longer wind-up is its channel only; the conjure is untouched.** *Every payment conjures, a mana chain included. The conjure carries the kind's feel, the step-in's duration (`startPush('stepIn', …, ab.conjure)`) and the anticipation art. The channel is the part only a cast chain pays, so "follow the payment" puts the load there.*
  - `castTime = conjure + channel` grows with the channel. So the HUD's channel bar, `useInterval`'s cadence and the cooldown all follow without a change (the cooldown counts from the press plus the channel, `pay(…, t + ab.channel)`).
- **Decided in the spec: no cooldown is touched.** The Primary's, the Defensive's and the Ultimate's cooldowns stay as they are, and so does a charge chain's lockout (`chargeLockout × quick.cooldown`). A Defensive or an Ultimate costs more only through its payment:
  - more mana (a Ward, paid with mana by default);
  - more charge (a Nova, paid with charge by default);
  - or a longer channel.

  *The user's rule is "follow the payment". A cooldown is no chain's payment, and Quick already owns the cooldown knob.*
- **Decided in the spec: stacking is one product.** Manaweaver's percentage, `castManaMult` and `(1 + load)` multiply, in that order, so Manaweaver takes its share off the loaded price too. *Every factor in the cost line is a multiplier today; a sum would make Manaweaver worth more on a runed move than its tooltip says.* Manaweaver doesn't touch charge or a channel, as today.
- **Worked example (revision 2):** a medium Bolt with tier III Echo + Heavy + Linger, `raw = 0.45 + 0.55 + 0.95 = 1.95`, every factor 1.
  - At 1 attunement in its element (a starting hero): `ease` 0.03, so `load` 1.89. Mana 8 → 23.1; charge need 2.8 → 8.1; cast 4 mana → 11.6, and the channel 0.35 × 1.2 (Heavy) = 0.42 s → 1.21 s; with Manaweaver 20, mana 8 × 0.8 × 2.89 = 18.5.
  - At 15 attunement (the supported build): `ease` 0.45, so `load` 1.07. Mana 8 → 16.6.
  - At 20 or more: `ease` 0.6 (the cap), so `load` 0.78. Mana 8 → 14.2.

### The sim readers that follow **(revision)**
The sim reads every price from `ResolvedAbility`, so these readers follow the load with no change:
- `canAfford` and `castAbility`'s refusal (with `noMana`).
- `pressDue`'s `payable` (`step.ts`, the press buffer): a waiting press whose next move the pool or the meter can't pay is skipped.
- `startHold`: a hold starts only when its stage 0 is affordable.
- `releaseHold`'s fallback: it lets go at the highest stage the pool affords, or unpaid.
- `pay`, which spends the loaded mana and charge.
- `cancelWindup` (`action.ts`), which gives back the loaded `chargePaid`, capped at `chargeCap`.
- `gainCharge` (`defend.ts`), Galvanize and Nightstalker (`combat.ts`), which fill toward `chargeCap`.
- `step.ts`'s no-cooldowns fill to `chargeCap` (Training Grounds).
- `world.ts`'s refresh clamp.

`chargeCap` is a chain's largest need, so the meter grows to hold the loaded need. The HUD snapshot's `cost`, `affordable`, `charge` and channel bar read the same numbers.

### Holds, echoes, Drain and the rest
- **A hold** loads every stage alike, because its runes are the move's. Each stage's own mana cost is loaded. A charge chain's need, which is already the full charge's at every stage, is loaded once.
  - **Accepted:** a hold in a cast chain absorbs its loaded channel the way it absorbs any wind-up today (the charging time counts toward it, `releaseHold`). So a long hold hides most of the longer channel; its loaded mana still pays.
- **An Echo** stays free: `echoTick` pays nothing. Echo's load is its price.
- **Drain's budget is half the move's cost before its load.** `fire` sets `drainLeft[slot] = baseCost(ab) × drainShare`, and Power's `drainPerUse` caps with the same. `baseCost(ab) = ab.cost / (1 + ab.load)`; a charge move's is 0, as today.
  - **Decided in the spec.** *Drain's cap exists so Drain can't pay for its own move. A cap that grew with the load would refund half of every rune's price, Drain's own included, and undo the cost the user asked for.*
- **A move the pool can't hold** **(revision).** A loaded mana move can cost more than the pool. A heavy mana Ultimate already does: 78 against a starting pool of 60.
  - The sim refuses it with `noMana`. A chain stuck on it waits out its restart window (`comboWindow`), then starts over from its first move.
  - The builder flags it with the existing warning. For a heavy mana Nova (78 before runes) with Leech I, at attunement 2 in its element (pool 66, eased 6%), the cost is 78 × (1 + 0.12 × 0.94) = 86.8, and the warning reads "Needs 87 mana; your pool holds 66."
  - Power counts it as the sim plays it (see "Power and the pool").
  - **Decided in the spec (revision): an uncastable runed mana Ultimate at a low pool is intended.** *It is the user's "build around it": the pool from attunement is the lever, and the warning names the gap.*
- **Determinism:** the load is arithmetic on resolved numbers; nothing new is rolled.

### The data
- **`runes.json`:** every row gains `load: number[]`, five fractions by tier, beside `tiers`:

  ```json
  { "id": "echo", "…": "…", "load": [0.27, 0.36, 0.45, 0.54, 0.63] }
  ```

  `RuneDefSchema` gains `load: z.array(z.number().min(0)).length(RUNE_TIERS).refine(nonDecreasing, 'load must not fall with tier')`, and `RuneDef` gains `load: number[]`.
  - **Decided in the spec: `load` is required on every row, and never falls with tier.** *A new rune then has to say what it costs, and the decisions' "tier V more than tier I" is checked at load.*
- **`balance.json → delve.runes.load`**, as the build finally ships it:

  ```json
  "load": {
    "bySlot": { "primary": 1, "defensive": 1, "ultimate": 1 },
    "byForm": {},
    "charge": 1,
    "cast": 1,
    "easePerAttune": 0.03,
    "easeCap": 0.6
  }
  ```

  Step 1 ships `bySlot` at 0 (see Build). The schema, inside `delve.runes`:

  ```ts
  load: z.object({
    bySlot: z.object({ primary: z.number().min(0), defensive: z.number().min(0), ultimate: z.number().min(0) }),
    byForm: z.record(z.string(), z.number().min(0)),
    charge: z.number().min(0),
    cast: z.number().min(0),
    easePerAttune: z.number().min(0),
    easeCap: z.number().min(0).max(1),
  }),
  ```

  `DelveBalance['runes']` gains `load: { bySlot: Record<AbilitySlot, number>; byForm: Partial<Record<FormId, number>>; charge: number; cast: number; easePerAttune: number; easeCap: number }` **(revision 2: the last two)**.
  - **Decided in the spec: `byForm` ships as `{}`, and a form missing from it counts as 1.** Its keys are checked against `arpg.json`'s forms in `tests/delve-rune-costs.test.ts` **(revision: that file)**. *The overrides are optional per entry, not per field, so the type stays a plain record. Without the check, a misspelled form would silently count as 1.*
  - These knobs are the user's "tuneable per rune and ability": per rune and tier in `runes.json`; per slot and per form here; the two conversions, which say how much of a mana-sized load becomes charge or channel; and the easing's rate and cap **(revision 2)**.
  - **Decided in the spec (revision 2): `easeCap` at most 1.** *An ease of 1 makes runes free; above it, a load would turn into a refund.*

### The starting loads
**The rule (revision 2):**
- Each rune's tier-III load is its **whole** measured tier-III gain over its `none` row, `ratio − 1`, **rounded up to the next 0.05**.
- Tiers I, II, IV and V are the tier-III load × 0.6, 0.8, 1.2 and 1.4.

The details:
- **Decided in the spec (revision 2): the whole gain, eased.** *The user asked for roughly double the half-gain loads. The whole gain is exactly double the half-gain rule before rounding, needs no extra multiplier, and reads simply: a starved hero pays about the full gain, and attunement takes up to 60% of it off. The prototype puts it inside every target (Balance and gates).* The first spec's half-gain table, as revised once, is superseded.
- **Decided in the spec: the gain is the rune's best on the ability forms** (the Primary's and the Ultimate's): the higher of one dummy and the pack, from the runes gate's last single-rune run (`gate-final`; tier III, depth 10, eight seeds). *Basics carry no load, so a rune's worth on a weapon's blows isn't what its load prices (Widen's 1.80 and Saturate's 1.34 are on an axe's blows). And a player sockets a rune where it shines, so its best showing sets its price.*
- **Decided in the spec: rounded up, not to the nearest.** *Rounding up keeps every load at or above its gain's share, so the price never undercuts the rule.*
- **Decided in the spec: the tier steps are × 0.6, 0.8, 1, 1.2, 1.4.** *It is the shape of the decisions' own Echo row (0.6 to 1.4 of its tier III) turned into a rule: at the whole-gain loads, Echo's row is [0.27, 0.36, 0.45, 0.54, 0.63]. It roughly tracks the runes' tier tables (Echo 30 → 60%, Heavy +15 → +45%, Guard 3 → 8%).*
- **Decided in the spec: no rune is free; the floor is 0.20 at tier III** **(revision 2: doubled with the rest)**.
  - It covers Leech and Guard: their worth is life, which the Lab can't size.
  - It also covers any rune whose ability gain comes to less. Widen is a loss on the dummies, because its worth there is reach the clump doesn't show. Saturate comes to exactly 0.20.
  - *"Utility runes a small fixed load": fixed here means set rather than measured. It still rises with tier like every load.*
- **(revision) Drain takes the rule, not the floor:** 0.40 at tier III **(revision 2)**. *The Lab does measure it: 1.36× on a Volley, mana turned into casts. That gain is what its load prices.*

| Rune | Best ability gain (tier III) | Tier-III load | I | II | III | IV | V |
|---|---|---|---|---|---|---|---|
| Split | 1.41 (Volley, pack) | 0.41 → **0.45** | 0.27 | 0.36 | 0.45 | 0.54 | 0.63 |
| Multi-shot | 1.25 (Bolt, one) | 0.25 → **0.25** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 |
| Pierce | 1.95 (Volley, pack) | 0.95 → **0.95** | 0.57 | 0.76 | 0.95 | 1.14 | 1.33 |
| Chain | 1.72 (Volley, pack) | 0.72 → **0.75** | 0.45 | 0.60 | 0.75 | 0.90 | 1.05 |
| Widen | 0.93 (Strike, pack) | floor **0.20** | 0.12 | 0.16 | 0.20 | 0.24 | 0.28 |
| Quick | 1.22 (Nova, pack) | 0.22 → **0.25** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 |
| Echo | 1.45 (Maelstrom, one) | 0.45 → **0.45** | 0.27 | 0.36 | 0.45 | 0.54 | 0.63 |
| Heavy | 1.52 (Barrage, one) | 0.52 → **0.55** | 0.33 | 0.44 | 0.55 | 0.66 | 0.77 |
| Saturate | 1.20 (Barrage, pack) | 0.20 → **0.20** | 0.12 | 0.16 | 0.20 | 0.24 | 0.28 |
| Linger | 1.93 (Nova, pack) | 0.93 → **0.95** | 0.57 | 0.76 | 0.95 | 1.14 | 1.33 |
| Volatile | 1.23 (Strike, pack) | 0.23 → **0.25** | 0.15 | 0.20 | 0.25 | 0.30 | 0.35 |
| Leech | 1.00 (life) | floor **0.20** | 0.12 | 0.16 | 0.20 | 0.24 | 0.28 |
| Drain | 1.36 (Volley; mana) | 0.36 → **0.40** | 0.24 | 0.32 | 0.40 | 0.48 | 0.56 |
| Guard | 1.00 (life) | floor **0.20** | 0.12 | 0.16 | 0.20 | 0.24 | 0.28 |

- At tier III, each Primary form's best set has a raw load of 1.95: Echo + Heavy + Linger (0.45 + 0.55 + 0.95), or Pierce + Echo + Heavy (0.95 + 0.45 + 0.55).
  - **Starved** (1 attunement, eased 3%): `load` 1.89, so **2.89× the mana per press**: inside the decisions' 2–3× band, which is measured here, at full price.
  - **Supported** (15 attunement, eased 45%): `load` 1.07, so **2.07×**.
  - At the cap (20 attunement or more, eased 60%): `load` 0.78, so 1.78×.
- The heaviest set anywhere at tier V, Pierce + Linger + Chain on a Bolt, has a raw load of 1.33 + 1.33 + 1.05 = 3.71: 4.60× the mana for a starting hero and 2.48× at the cap. **Accepted (revision 2):** tier V is out of a starting hero's reach, which is the point. *Its price at the cap sits back inside the band.*
- **Accepted (revision): Quick can be a net loss on a mana-bound move in a starved build.** It shortens the beat and the cooldown, so the move casts more often, but each cast costs more and a starved pool can't feed the extra casts. *That is the trade the user asked for: a rune you can't feed is a rune you pay for.*

### What each consumer shows or does

**`ResolvedAbility`** (`types/ability.ts`) gains:

```ts
/** Its runes' load (see the rune costs spec): Σ runeLoad over `runes` × (1 − ease), before the payment's conversion. 0 without runes. */
load: number;
/** How much its attunement eases its runes' load (revision 2): min(easeCap, easePerAttune × its average attunement). Set with or without runes. */
ease: number;
```

`resolve.ts` also exports `baseCost(ab: ResolvedAbility): number`, which is `ab.cost / (1 + ab.load)`: the move's mana cost before its load, for Drain's cap.
- **Decided in the spec (revision 2): `ease` is exposed beside `load`.** *The builder's "Attunement eases rune cost by 45%" and the picker's eased prices both need it, and it costs one number per move.*
- **Decided in the spec: `load` is exposed, after easing and before the payment's conversion.** *The readout and the gate need the move's total without re-summing its runes. One number per move serves all three payments: mana and cast cost × (1 + load); charge × (1 + load × charge); channel × (1 + load × cast).*

**`runeText`** (`loot/runes.ts`) takes the move's price terms and returns the rune's cost **(revision 2: an options object, with `ease`)**:

```ts
export interface RunePriceTerms {
  /** The chain's payment: the words. */
  payment?: AbilityPayment;
  /** The move's `ResolvedAbility.ease`: the eased figure. Absent: the raw figure. */
  ease?: number;
}
export function runeText(
  registry: DataRegistry,
  ref: RuneRef,
  on?: RuneTarget,
  terms?: RunePriceTerms,
): { effect: string; tradeoff: string | null; cost: string | null };

/** The ease a hero's attunement gives a move of `elements` (revision 2): min(easeCap, easePerAttune × their mean attunement). */
export function loadEase(registry: DataRegistry, stats: HeroStats, elements: readonly ManaType[]): number;

/** A load as the player reads it, in the payment's own terms: "+25% cost", "+25% charge", "+25% cast wind-up, +25% cost". */
export function loadText(registry: DataRegistry, load: number, payment?: AbilityPayment): string;
```

- `cost` is `loadText` of the rune's share:
  - with `on` a form: `runeLoad(registry, ref, on.form)`, × `(1 − terms.ease)` when the ease is known **(revision 2)**;
  - with no `on` (the pouch): its tier's raw `load`, since no slot, form or ease is known;
  - with `on` a blow: **null**, because blows are free;
  - null whenever the share comes to 0 (a factor set to 0).
- `loadText`'s words, by payment, with whole percentages (`Math.round(x × 100)`):
  - `'mana'`, or no payment known: "+25% cost";
  - `'charge'`: "+25% charge" (the load × `charge`);
  - `'cast'`: "+25% cast wind-up, +25% cost" (the load × `cast`, then the load).
- **Decided in the spec: "cast wind-up", not "wind-up".** *The load lengthens the channel only. The builder's "0.35s wind-up" is conjure plus channel, so "+25% wind-up" would overstate it. "A cast wind-up" is already the payment's name for the channel.*
- **Decided in the spec: the price terms are a fourth argument, not fields on `RuneTarget`.** *`RuneTarget` decides fit and dormancy, which payment and easing never touch; widening it would put them into `runeFits`' signature for nothing.* **(revision 2)** They are one options object, `{ payment, ease }`, so a third term needn't add a fifth argument.
- **Decided in the spec (revision 2): `runeText` takes the ease, not the stats.** *The caller already resolves the move (for dormancy), and `ResolvedAbility.ease` is the one number `resolveAbility` used. Recomputing it from stats in a second place could drift.*
- **Decided in the spec: blows show no cost line.** *Free is the absence of a price. The same rune, picked for a move, shows its price there, and that contrast is the trade the user described.*
- **Decided in the spec (revision): a dormant rune shows no price, by one rule: `ResolvedAbility.runes`.** `runeText` knows the form but not the elements, so it can't tell Pierce on an Earth Bolt (the one ability case) from Pierce on a Fire Bolt. So `runeText` stays dormancy-free, and its caller hides the cost wherever it dims the rune:
  - The current rune is dimmed from the builder's dormant list, which already reads `ResolvedAbility.runes`.
  - Each candidate is dimmed when resolving the move with it in the socket leaves it out of `ResolvedAbility.runes`. That is at most one `resolveAbility` per candidate.

  *One function decides dormancy and the price follows it. A second rule inside `runeText` could drift from the resolver.*
- The client still never formats a rune's numbers: `loadText` is the one formatter, both for a rune's share and for a move's total.

**The rune picker** (`features/delve/runes/RunePicker.tsx`):
- `RunePickerProps` gains `payment?: AbilityPayment` and `ease?: number` **(revision 2)**, passed to `runeText` as its terms. The builder takes `ease` from the edited move's `ResolvedAbility`; the Training Grounds from their own stats, the same way.
- `RuneEffect` prints `effect · tradeoff · cost`, with the cost in the trade-off's amber (`text-amber-200/80`) so the price reads as a price, and hidden when the rune is dimmed.
- The builder (`ChainEditor.tsx`) passes the edited chain's payment (none for the basic chain). The stop's rune pick (`StopPanel.tsx`) passes the saved chain's, with the saved move's ease (resolved from `profileStats`).
- The Training Grounds use `ChainEditor`, so they show it too. The current rune (Pull) shows it the same way.

**The pouch** **(revision)** (`RunePouchPanel.tsx`): each rune's effect line adds its raw cost, `runeText(registry, rune).cost` ("+45% cost"), the no-target branch: the full, uneased price **(revision 2)**. *A rune's price belongs beside its effect wherever the effect shows, and this gives the no-target branch its consumer.*

**The builder's cost line** (`chains/MoveEditor.tsx`'s `Readout`):
- The pay string already reads the loaded `ab.cost`, `ab.chargeNeed` and `ab.castTime`.
- When `ab.load > 0`, it appends ` (runes: ${loadText(registry, ab.load, ab.payment)})`, the eased figure. For the medium Bolt of the worked example at 15 attunement:
  - "17 mana · …s wind-up (runes: +107% cost) · 0.45s cooldown, then a …s beat";
  - "Charge 6 · …s wind-up (runes: +107% charge) · no cooldown, …";
  - "8 mana · …s wind-up (runes: +107% cast wind-up, +107% cost) · …" (4 × 2.0725 = 8.3).
- **(revision 2)** When the move has runes acting and `ab.ease > 0`, a line follows: "Attunement eases rune cost by 45%" (`Math.round(ab.ease × 100)`). At the cap it adds " (the most it can)".
  - **Decided in the spec (revision 2): the easing gets its own line.** *It names the lever (attunement) beside the price it moves, which is the user's "build around it". Folding it into the price would hide why two heroes pay differently.*
- A hold's "Fully charged" line already shows its loaded price and adds nothing.
- The pool warning ("Needs 87 mana; your pool holds 66." for the heavy mana Nova above) reads the loaded cost and needs no change.

**The mana support readout** **(revision)**. One engine helper, in step 1 (`delve/hero-stats.ts`):

```ts
export interface ManaSupport {
  /** Mana a second the chain spends, held at its cadence: each move's cost over the
   *  interval its cooldown, wind-up and beat allow (`useInterval` with mana and charge
   *  unbounded), as if the pool always paid. 0 for a charge chain. */
  spend: number;
  /** Mana a second the build brings back while it does: regen, the basics at their full
   *  rate (`basicAttackGain` a strike plus the blows' Drain, as Power counts them), and
   *  this chain's own Drain at its cadence (`drainPerUse`). */
  refill: number;
}
export function manaSupport(registry: DataRegistry, stats: HeroStats, chain: ResolvedChain): ManaSupport;
```

- `refill`'s first two terms are factored out of `estimateCombat` as `basicIncome(registry, stats): number`: `income + blowDrain / strikeInterval`. Here `income` is `manaPool(…).regen + basicAttackGain / strikeInterval`, and `blowDrain` is the mean of the blows' capped Drain.
  - It replaces exactly that sum inside `manaIncome`, and nothing else. `manaIncome` becomes `basicIncome(…) + drained(primary, 0.7) + drained(ultimate, 0.3) + drained(defensive, 0.3)`.
  - `income` itself, which leaves out Drain and is what `drained()` measures each skill's interval against (`hero-stats.ts`, about line 538), stays as it is.
  - The golden test compares Power exactly and DPS with `toBeCloseTo`, since moving the sum into a function may change the last float bit.
- **The builder** (`ChainEditor.tsx`, B) shows one line under a mana or cast chain's moves: "Spends 14/s · your build refills 9/s". It resolves the draft chain with the hero's stats (`resolveChain`, then `manaSupport`) and shows whole numbers, amber when spend > refill. A charge chain and the basic chain show none. The Training Grounds show it from their own stats.
- **Decided in the spec (revision): the refill counts the basics at their full rate, as Power does.** *A held ability squeezes some swings out, so the line is optimistic, but it is a planning number. One estimate shared with Power keeps the readout and the autopilot from disagreeing about whether a build can feed a chain.*
- **(revision 2)** `spend` reads the eased costs, so the same chain spends less on a better-attuned hero. That is easing's effect, seen where the player plans; the line needs no change for it.
- **Decided in the spec (revision): `spend` ignores the pool cap.** *A move the pool can't hold has its own warning; folding it into `spend` would make an unfeedable chain look cheap.*

**The HUD: no change.**
- The snapshot's `cost` is `ab.cost`, `affordable` is `canAfford`, `charge` is the meter over `ab.chargeNeed`, and the channel bar spans `conjureUntil → until`. Each is already the loaded number.
- A runed move greys out ("mana") sooner and its charge ring fills more slowly; that is the cost showing.
- **Decided in the spec: no new HUD element.** *The HUD shows readiness, not prices. The price is the builder's, and the readiness already follows it.*

**Power** (`delve/hero-stats.ts`). `useInterval` already takes the longest of three spans, each of them a loaded number:
- the cooldown, plus the channel;
- the payment (`cost ÷ mana income`, `chargeNeed ÷ charge rate`);
- the cadence (wind-up plus beat).

So a mana-bound Primary's Power falls by about its `(1 + load)`, and a rune is worth its gain net of its price. **(revision 2)** The load is the eased one, from the hero's own attunement, so Power values the same rune higher on a better-attuned hero with no new term. Two changes:
- `drainPerUse` caps with `baseCost(ab) × drainShare` (step 1).
- **Power and the pool (revision, A).** Power values a chain as the sim plays it against the hero's pool (`manaPool(stats).max`), through one new reader:

  ```ts
  /** The moves Power values, in order: each at its valued stage (a hold at the highest stage
   *  the pool affords, up to full charge), cut after the first move the pool can't pay,
   *  which is null. With `pool` Infinity it is today's `valuedMove` for every move. */
  export function valuedChain(chain: ResolvedChain, pool?: number): (ResolvedAbility | null)[];
  ```

  - `damagePerUse`, `useInterval`, `drainPerUse`, `guards` and `runeLeech` (`hero-stats.ts`, about line 421) read it in place of `valuedMove`. Each takes an optional `pool` (default Infinity), and `estimateCombat` passes the hero's pool. A null move adds no lifesteal, Drain or Guard.
  - The Defensive's effect (`valuedMove(defensive, 0)`, about line 574) becomes `valuedChain(defensive, pool)[0]`. When it is null, the Defensive gives no effect: no uptime, no Ward, Armor, Surge or Blink.
  - The moves before the cut count as today. The null move deals nothing and takes `comboWindow` seconds (the press waits out the restart window, then the chain starts over). The moves after it never fire.
  - A chain whose first move the pool can't pay deals nothing.
  - A hold whose stage 0 the pool can't pay is a null move (`startHold` never starts it). Otherwise it is valued at its highest affordable stage, matching `releaseHold`'s fallback.
  - **Decided in the spec (revision).** *Power valued an over-pool move at full worth while the sim never casts it, so a runed mana Ultimate would have read as a gain. The autopilot would then socket and keep it.*
  - It can move Power without runes too, but only for a hero with a move over its pool (a heavy mana Ultimate at a starting pool), which the sim never casts. A lands it before the loads and records the pacing run between, so the two effects show apart.

**The autopilot** (`delve/autopilot.ts`): **no code change.** Opening (`openSockets`), socketing (`bestRune`, `socketBest`) and the stop's rune (`runeStop`) all take a rune only when it raises `profilePower`, which now nets the rune's cost and the pool. So a rune whose load outweighs its gain on a move is never socketed there, and a socket nothing gains from is never opened. **(revision 2)** With easing, a fresh hero (attunement 1 to 3) finds most runes net-negative and leaves its sockets for later. As its attunement grows, the same runes start to pay and get socketed. That is the curve the user asked for, played by the bot.
- **Accepted (revision): the mana split.** Power shares mana income between skills by fixed shares (the Primary 0.7, the Ultimate and the Defensive 0.3), and the sim doesn't. In a dive, a heavily loaded Primary held down can starve a mana-paid Ward that Power still values as fed. *The pacing rails are the guard: a bot that starves its Ward dies sooner, and the rails catch it.*

**The Training Grounds:** the prices apply, but the default toggles make mana and charge moot. Infinite mana tops the pool up every tick (`canAfford` ignores cost), and no-cooldowns keeps every charge chain at its cap. A cast chain's longer channel is time, not a toggle, so it still shows. With the toggles off, the sandbox pays as a dive does. The readouts show the prices either way, eased by the sandbox's own attunement (its extra attunement included) **(revision 2)**.

**The DPS Lab** (`arpg/dps-sim.ts`, `pages/DelveLab.tsx`, `features/delve/lab/lab-model.ts`) **(revision)**:
- `DpsOptions` gains `sustained?: 'starved' | 'supported'` (absent: full mana, as today). Either value **empties the pool** (`h.mana = 0`) and every charge meter right after `createSandboxWorld`. The basics swing on their own under a held ability and refill the pool, the held button presses as today, and runes cost what `resolveAbility` says.
  - `'starved'`: the setup's hero as built. That is the Lab's plain common weapon at depth 10 (attunement 1 in its element): pool 63, regen 4.2, 5 mana a basic hit, no Drain, and runes eased 3% **(revision 2)**.
  - `'supported'`: the same hero with three changes. The other blows, the chains and the Primary's runes are unchanged.
    1. **Attunement:** `computeHeroStats`' `extra.attunement` adds 14 to the setup's first element and 5 to its second (Frost on a Fire-only set). That makes the primary 15, past mastery (10), and a total of 20: pool 120. **(revision 2)** It also eases a Fire move's runes by 45%, and a Fire + Frost move's by 30% (the mean, 10).
    2. **Regen:** the computed stats' `manaRegenMult` is 1.3, one Mana Regen affix at its top roll (+30%). Regen comes to (4 + 0.2 × 20) × 1.3 = 10.4.
    3. **Drain:** Drain III is socketed in every basic blow (+2 mana per foe-hit, at most 2.5 a strike, beside the strike's fixed 5).
- **Decided in the spec (revision): the supported build.** Its levers are the code's real mana levers:
  - **The pool and regen come from attunement**, set at a dive-12 hero's. Measured (the autopilot, seeds 1–4, Fire, 12 dives): primary 5–15 (mean 11.5), total attunement 13–23 (pool 99–129), Mana Regen 1.00–1.36×. Supported takes the top seed's primary and the mean's total. *It is a hero who built for mana, not a lucky one.*
  - **Mana per basic hit** is a fixed 5 (`basicAttackGain`); no gear raises it. Drain is that lever, so it is in the build.
  - **Drain sits on the basics, not in the Primary's set.** *The gate measures the Primary's best three runes, so a fourth can't join them. Drain on the blows is free (blows carry no load) and is the user's own trade: "using this rune on your basic ability instead of your primary".*
  - **No Manaweaver.** *It is a legendary, found rather than built; two of the four seeds held it, which the margin covers.*
- **Decided in the spec: one option on every view, like the pack, not a fourth view.** *It is a starting condition (with the supported hero's three changes), and separate rows would duplicate the rune view's setups. The basic view's rows come out the same starved (a basic attack spends no mana), and the tests pin that.*
- **Decided in the spec: 30 s, the same as every run.** *The pool refills from empty within a few casts, so 30 s is mostly the steady state, and one `DPS_SECONDS` keeps the series and the chart one shape.*
- **The Lab page:** a "Mana" select beside "Pack" (full, starved, supported; `data-testid="lab-mana"`), passed in the worker's `DpsOptions`. The session's results are kept per option:

  ```ts
  // lab-model.ts
  export function remember(
    depth: number, pack: boolean, sustained: DpsOptions['sustained'], rows: readonly LabRow[],
  ): void;
  export function recall(
    depth: number, pack: boolean, sustained: DpsOptions['sustained'], keys: readonly string[],
  ): LabRow[];
  // key: `${depth}|${pack}|${sustained ?? 'full'}|${dpsKey}`
  ```

  `lab-model.test.ts` passes the new argument in its `remember` / `recall` calls, and adds a test that one key under two `sustained` values is kept apart.

## Balance and gates
- **No runes, no change:** the grid's basic and ability views come out identical, row for row, because a move without runes has a load of 0. Every hero's Power without runes is unchanged too, except over-pool moves (above). The "Power without runes" tests stand.
- **The power ceilings are unchanged:** one dummy 2.0× a rune and 3.0× a set; the pack 2.5× and 4.0×.
  - **(revision 2)** They are measured **unloaded** (`bySlot` zeroed), so they read exactly as at v0.51.0 and hold as recorded.
  - **Decided in the spec (revision 2): the ceilings cap power, so they're measured without the price.** *At the Lab's starting attunement, the doubled loads take nearly all of a rune's gain back at full mana. Predicted, the best pack sets fall from 2.40–3.78× to 1.08–1.35×. Measured loaded, a ceiling would stop seeing what a rune does, and a supported hero, who pays about half, could carry a rune past it unnoticed.*
  - The loaded full-mana ratios are reported beside them.
- **The sustained gate (revision).** For each Primary form (Bolt, Volley, Lance, Burst, Strike):
  1. **The fully runed build:** the form's default chain, paid with mana, with every move holding the same three runes at tier III. The set is the one with the highest pack ratio in the full-mana rune view among the form's `runeComboSetups`, **ranked with the loads zeroed** (`bySlot` all 0) and then measured with them.
     - Today that ranking gives Echo + Heavy + Linger for Bolt, Lance, Burst and Strike, and Pierce + Echo + Heavy for Volley.
     - **Decided in the spec (revision): rank unloaded.** *"Best" means the strongest build, which is what a player chasing damage sockets. Ranking with the loads in would let a cheap set win the ranking and dodge the cost check.*
  2. **Starved** (`{ pack: true, sustained: 'starved' }`, eight seeds): the runed build's DPS over the rune-less chain's on the same elements. **Reported, no floor; the target is about 0.9–1.2× (a trap) (revision 2)**, for tuning, not failing.
     - **Decided in the spec (revision 2): the starved target is reported, not gated.** *The user's rule is "starved not required to win", with no hard bound. Volley's Pierce set is a known exception on the pack (below), and a hard ceiling would make tuning chase one form.*
  3. **Supported** (`{ pack: true, sustained: 'supported' }`, the same hero for both rows): **at least 1.5×**.
     - **Decided in the spec (revision): on the pack.** *Dives fight packs, and the sets were ranked there. One dummy is measured and reported for both builds.*
  4. **Mana per press** (a check that loads matter): the mean `cost` of the resolved chain's moves (a hold at stage 2), runed over rune-less, must be **between 2.0× and 3.0×**, **measured on the starved hero (revision 2)**: the full price, eased only 3%.
     - It is exact arithmetic, `1 + load` when every move holds the same acting runes.
     - The supported hero's (eased 45%) is reported beside it: **2.07×** for every form at the starting loads.
     - **Gross of Drain's refund:** it is what a press pays, not what comes back.
  5. **The price bites (reported):** each build's sustained ratio with the loads must be below the same ratio with the loads zeroed. The gap is how much the price takes.
  - **Predicted (revision 2)** (the prototype; eight seeds, tier III, raw load 1.95 for every set; starved and supported as loaded, with unloaded in brackets):

    **Pack**

    | Form | Set | Mana per press, starved / supported | Full mana | Starved | Supported |
    |---|---|---|---|---|---|
    | Bolt | Echo + Heavy + Linger | 2.89× / 2.07× | 2.56 → 1.08 | **1.01** (2.42) | **1.77** (2.26) |
    | Lance | Echo + Heavy + Linger | 2.89× / 2.07× | 2.40 → 1.13 | **1.07** (2.44) | **1.62** (2.09) |
    | Burst | Echo + Heavy + Linger | 2.89× / 2.07× | 2.61 → 1.21 | **1.13** (2.62) | **1.74** (2.25) |
    | Strike | Echo + Heavy + Linger | 2.89× / 2.07× | 2.60 → 1.21 | **1.18** (2.64) | **1.89** (2.33) |
    | Volley | Pierce + Echo + Heavy | 2.89× / 2.07× | 3.78 → 1.35 | **1.34** (3.68) | **2.07** (2.71) |

    **One dummy** (reported)

    | Form | Full mana | Starved | Supported |
    |---|---|---|---|
    | Bolt | 2.81 → 1.19 | **1.11** (2.49) | **1.83** (2.40) |
    | Lance | 2.55 → 1.16 | **1.10** (2.64) | **1.77** (2.27) |
    | Burst | 2.57 → 1.17 | **1.10** (2.63) | **1.76** (2.26) |
    | Strike | 2.49 → 1.19 | **1.14** (2.61) | **1.83** (2.20) |
    | Volley | 1.27 → 0.45 | **0.45** (1.22) | **0.68** (0.90) |

    - **Supported clears 1.5× on every form:** 1.62–2.07 on the pack, with Lance closest. The gap over starved is now 0.55–0.88 (it was 0.24–0.39).
    - **Starved lands in the trap:** 1.01–1.18 on the pack for Bolt, Lance, Burst and Strike, and 1.10–1.14 on one dummy.
    - **Volley is the exception:** 1.34 starved on the pack. Pierce's pack gain, 3.68× unloaded, is the most any set adds, and its starved casts stay at 12 in 30 s at any load from 1.89 to 1.99 (the pool's refill sets them). On one dummy it is 0.45: a trap there. **Accepted (revision 2):** *starved is reported, not gated. `byForm.volley` has little room: the band allows about 1.06 at most (3.0× at full price), and between loads 1.89 and 1.99 the ratio didn't move.*
    - **Every price bites:** each loaded ratio is below its unloaded one.
    - The tuning that got here: the earlier half-gain table at 1.8× and 1.9× gave starved 1.07–1.22 and 1.02–1.18 and supported 1.66–2.14 and 1.60–2.04 (pack, Volley aside). 1.9× would also put starved at 2.93× the mana, near the band's top. The whole-gain table lands between them (1.95 against 1.89 and 1.99), with every number a 0.05 step.
  - The gate is a skipped-by-default vitest file, `tests/delve-rune-costs-gate.test.ts` (`describe.skipIf(!process.env.RUNE_COST_GATE)`). It prints a row per form (the set; its full-mana, starved and supported ratios, loaded and unloaded, on both layouts; its mana per press for both builds) and fails on a breach of the supported floor (1.5×, pack) or of the mana-per-press band (2.0–3.0×, starved hero). The unloaded runs use a registry cloned from the default data with `bySlot` zeroed. **Decided in the spec: in the repo, not a scratch script.** *The loads will be tuned again, and the gate should be one command away for whoever tunes them.*
  - **Decided in the spec: the gate covers mana chains only.** *The Primary's default payment is mana, and the decisions' "costs 2–3× the mana" is a mana statement. `charge` and `cast` start at 1 and are tuned by play.*
- **Tuning order** when the gate fails: tune the loads and the easing; never the ceilings, the floor or the band.
  1. `byForm` for the form that misses (a form whose best set gains less pays less).
  2. `bySlot.primary`, if every form misses the same way.
  3. **(revision 2)** `easePerAttune` (and `easeCap`), if supported misses while starved is in its trap. *Easing moves only the supported side (a starting hero is eased 3%), so it opens or closes the gap without touching the band.*
  4. The rows of the runes in the failing sets.
  - **If a form can't meet the supported floor and the band together, stop and report the numbers to the user**, as the runes gate did.
- **Measured** after the build goes in the release notes: each form's set and ratios for both builds, the singles' and the combos' maxima against the ceilings, and the pacing rails at each stage.

## Pacing
- **Before anything changes,** capture v0.51.0's `runAutopilot` numbers at HEAD. The last recorded run (2026-10-01, after the runes fixes, `pacing-fix`):
  - first dives 3, 3, 3, 3 (mean 3; each ≥ 3, mean ≤ 12);
  - dive 6 and dive 12 means 24.25 and 36;
  - Frost, dive 1 → dive 12: 3.5 → 35.5 (≥ dive 1 + 5);
  - legendaries at dive 12: 5.75 (≥ 1, < 12);
  - the own pair's reaction: 6 of 6;
  - the 15-pair sweep's median: 24 (21–31; allowed 14.4–38.4);
  - seconds a floor: 29.80 (8–60).

  **(revision)** It is run again after Power's pool rule and before the loads, so each change's effect shows apart.
- **Expected:** runes now drain mana. So the autopilot sockets fewer of them (only where they net Power), its Primaries cast less often where they do, and fights run longer. Dives may get shallower and floors longer. The Links that sockets no longer take go to the 4th and 5th slots.
  - **(revision 2)** With easing, the early dives feel it most: a fresh hero pays nearly full price, so its runes mostly wait. By dive 12 its attunement (5–15 measured) eases them 15–45%. Expect the dive-6 mean to drop more than dive 12's.
- **Every rail in `tests/delve-pacing.test.ts` must hold.** If one breaks, **re-tune the loads, not the rails**: `bySlot` first (one number a slot), then `easePerAttune` **(revision 2)**, then the rows of the runes the autopilot socketed most. If no loads that keep the gate's floor and band also hold the rails, stop and report the numbers to the user.

## Where the code changes

| Area | Files | What |
|---|---|---|
| Types | `engine/src/types/rune.ts`, `types/ability.ts`, `types/delve.ts` | `RuneDef.load`, `ResolvedAbility.load`, `DelveBalance['runes']['load']` |
| Data | `engine/src/data/runes.json`, `data/balance.json`, `data/schemas.ts` | the 14 `load` rows, `delve.runes.load`, their schemas |
| Resolve | `arpg/abilities/resolve.ts`, `loot/runes.ts` (`runeLoad`, `loadEase`) | `load` (eased), `ease`, the three prices, `baseCost` |
| Sim | `arpg/abilities/cast.ts` | Drain's budget from `baseCost` |
| Power | `delve/hero-stats.ts` | `drainPerUse` on `baseCost`, `basicIncome`, `manaSupport`; `valuedChain` and the pool |
| Lab | `arpg/dps-sim.ts`, `client/src/pages/DelveLab.tsx`, `client/src/features/delve/lab/lab-model.ts` | `DpsOptions.sustained`, the supported hero, the Mana select, the session key |
| Gate | `engine/tests/delve-rune-costs-gate.test.ts` (new) | the two-build gate, skipped by default |
| Texts | `loot/runes.ts` | `loadText`, `runeText`'s terms (`payment`, `ease`) and `cost` |
| Client | `features/delve/runes/RunePicker.tsx`, `RunePouchPanel.tsx`, `chains/ChainEditor.tsx`, `chains/MoveEditor.tsx`, `StopPanel.tsx` | the picker's and the pouch's cost, the payment and ease passed in, dimmed candidates, the readout's runes note and easing line, the mana support line |
| Docs | `CLAUDE.md`, `packages/client/package.json` | the Runes and DPS Lab bullets, v0.52.0 |

Unchanged on purpose: `delve/autopilot.ts`, `ArenaHud.tsx` and `useArenaCore.ts`, `computeHeroStats`' blows, every sim reader listed above, and the save.

## Build
One contract step, then two agents in parallel worktrees, then a finish. A reviewer checks each agent's work, and a final review checks the whole.

### Step 1: the contract (merged before A and B start) **(revision: green, with the loads at 0)**
**Every existing test stays green and every number stays identical**, because step 1 ships `bySlot` at 0, so every load is 0. It adds:
- **Types:** `RuneDef.load: number[]`; `ResolvedAbility.load: number` and `ease: number` **(revision 2)**; `DelveBalance['runes']['load']`, as in "The data".
- **Data and schemas:** the table's 14 `load` rows; `delve.runes.load` with `bySlot` `{ primary: 0, defensive: 0, ultimate: 0 }`, `byForm` `{}`, `charge` 1, `cast` 1, `easePerAttune` 0.03 and `easeCap` 0.6 **(revision 2)**; `RuneDefSchema.load` (length 5, ≥ 0, non-decreasing); the `load` schema. With `bySlot` at 0 every `raw` is 0, so the easing changes nothing either.
- **`resolveAbility`:** the variable `load`, summed over the runes it returns and eased; the three prices; the `load` and `ease` fields.
- **Drain:** `fire`'s `drainLeft` and `drainPerUse`'s cap on `baseCost`.
- **The mana support helper:** `basicIncome` (read by `estimateCombat`) and `manaSupport`.
- **Helpers:**

  ```ts
  // loot/runes.ts (exported whole through `export * from './loot/runes.js'`)
  /** One rune's share of a move's load on `form`: its tier's load × its slot's and its form's factors. */
  export function runeLoad(registry: DataRegistry, ref: RuneRef, form: FormId): number;
  /** The ease a hero's attunement gives a move of `elements` (revision 2). */
  export function loadEase(registry: DataRegistry, stats: HeroStats, elements: readonly ManaType[]): number;

  // arpg/abilities/resolve.ts (added to src/index.ts's named list)
  /** A move's mana cost before its runes' load (0 for a charge move): Drain's cap reads it. */
  export function baseCost(ab: ResolvedAbility): number;

  // delve/hero-stats.ts (added to src/index.ts's named list)
  export function basicIncome(registry: DataRegistry, stats: HeroStats): number;
  export function manaSupport(registry: DataRegistry, stats: HeroStats, chain: ResolvedChain): ManaSupport;
  ```

- **Tests:** `tests/delve-rune-costs.test.ts`. The data checks (the `byForm` keys among them) run with any loads. The price tests use a cloned registry with `bySlot` at 1.

### A: the engine (after step 1)
Steps, in order:
1. **Power's pool rule** (`valuedChain`), then a pacing run.
2. **`bySlot` to 1**, the shipped loads (eased), and the expectations the loads change: the rune-view numbers, and `delve-rune-sim.test.ts`'s tests that compute a price or Drain's cap.
3. **The Lab:** `DpsOptions.sustained` with the supported hero in `dps-sim.ts`, and the page's Mana select and session key. A alone owns the Lab, engine and page, as the runes' D did.
4. **The gate file**, the Power tests' restatement, the gates and the pacing run. A tunes loads in the order above and reports before any rail, ceiling, floor or band would move.

- **Files it owns:** those, `tests/delve-rune-costs.test.ts`, `tests/delve-rune-power.test.ts`, `tests/delve-rune-sim.test.ts` **(revision)**, `tests/delve-dps-sim.test.ts`, `lab-model.test.ts`, the gate file, and the data files for tuning.

### B: the texts and the client (after step 1)
- `loadText`, and `runeText`'s terms and `cost` (`loot/runes.ts`, below `runeLoad` and `loadEase`, which B doesn't change).
- `RunePickerProps.payment` and `ease`; the eased cost in `RuneEffect`, hidden when dimmed; candidates dimmed by resolving them in the socket.
- `ChainEditor` and `StopPanel` passing the chain's payment.
- The pouch's cost.
- The `Readout`'s runes note and its easing line **(revision 2)**.
- The builder's mana support line.

- **Files it owns:** those, and their tests: `features/delve/runes/__tests__/`, the `chains/` tests, and the engine's `runeText` tests in `tests/delve-runes-contract.test.ts`.
- **The contract it builds on**, all from step 1: `RuneDef.load`, `DelveBalance['runes']['load']`, `ResolvedAbility.load` and `ease`, `runeLoad`, `loadEase`, `manaSupport`.
  - Its tests build their own registry with `bySlot` at 1 (step 1 ships 0).
  - It reads loads through the registry and never hard-codes one, except in a test that pins the table.
- **Merge points with A:** none in the same function.
  - A never edits `loot/runes.ts` after step 1.
  - B never edits `src/index.ts`, `resolve.ts`, `hero-stats.ts` or the data files.
  - If A's tuning changes a load that B's tests pin, A updates that expectation.

### Finish
The gates' numbers in the release notes, `CLAUDE.md`, and v0.52.0.

## Testing
- **Engine** (`tests/delve-rune-costs.test.ts` unless named):
  - **Data:** every rune has five loads, non-decreasing and ≥ 0; one test pins the 14 rows, so any tuning shows in review; `byForm`'s keys are real forms **(revision: here)**.
  - **`runeLoad`:** the tier's load × `bySlot` × `byForm` (a fixture balance with a slot at 0.5 and a form at 2).
  - **Easing (revision 2):**
    - `loadEase` is `easePerAttune × attunement`, capped at `easeCap`, and a two-element move uses the mean;
    - `load = raw × (1 − ease)`, so attunement 1, 15 and 25 give 0.97, 0.55 and 0.4 of raw;
    - `ease` is set on a rune-less move, while its `load` stays 0;
    - the schema refuses an `easeCap` above 1.
  - **No runes, and step 1's zeroed `bySlot`:** every slot, payment, kind and hold stage resolves exactly as before. The load is 0, and the cost, charge need, conjure, channel and cooldown match a v0.51.0 golden.
  - **Each payment:**
    - mana: `cost × (1 + load)`;
    - cast: `cost × (1 + load)` and `channel × (1 + load × cast)`, with the conjure unchanged;
    - charge: `chargeNeed × (1 + load × charge)`, with `cost` 0;
    - no payment's cooldown changes, the charge lockout included, and `chargeCap` follows the loaded need.
  - **The sum:** three runes add. An empty socket, an unknown id and the Pierce on an Earth Bolt add nothing (`runes` and `load` agree).
  - **Stacking:** Manaweaver gives `8 × 0.8 × (1 + load)`, and each of a hold's stages is loaded.
  - **Blows:** `HeroBlow` is unchanged with runes socketed.
  - **`manaSupport`:** `spend` is the mean cost over the unbounded `useInterval`, and 0 for a charge chain. `refill` is `basicIncome` plus the chain's Drain. `estimateCombat` is unchanged by the `basicIncome` refactor: a golden comparing Power exactly and DPS with `toBeCloseTo`.
  - **The sim** (`delve-rune-sim.test.ts`, A):
    - a loaded move that the pool covers only before its load is refused with `noMana`;
    - a waiting press for it is skipped (`pressDue`);
    - a hold over the pool at stage 2 lets go at stage 1;
    - Drain's budget is `baseCost × drainShare` (the Drain tests switch to `baseCost`).
  - **Power** (`delve-rune-power.test.ts`, A):
    - `valuedChain` cuts after an over-pool move, which counts `comboWindow` and no damage, and values a hold at its highest affordable stage;
    - with `bySlot` zeroed, a runed hero's Power is its v0.51.0 value, and with the shipped loads it is lower for a mana-bound Primary;
    - the autopilot opens no Primary socket when `bySlot.primary` is 10;
    - a runed mana Ultimate over the pool lowers Power.
    - **Decided in the spec: "Drain never costs DPS" becomes "Drain adds DPS on some setup".** *Drain's own load can now outweigh its refund, which is the point: a one-target Nova at a starting attunement pays about 23 mana of load (0.40 × 0.97 × 60) for 2 back.*
    - The `it.fails` direction test (Power against the Lab) stays marked. If the loads make it pass, it becomes an `it`.
  - **The Lab** (`delve-dps-sim.test.ts`, A):
    - both sustained values start at 0 mana and 0 charge;
    - supported's pool is 120 and its regen 10.4, with Drain on every basic blow and a Fire move's runes eased 45%;
    - a basic-view row comes out the same starved or not;
    - the basic and ability views' rows are unchanged at full mana;
    - a runed rune-view row casts less when starved.
- **Client:**
  - `runeText` (engine, B):
    - "+45% cost" for Echo III on a Bolt paid with mana, "+45% charge" with charge, and "+45% cast wind-up, +45% cost" with cast;
    - **(revision 2)** with `ease` 0.45, the eased figure ("+25% cost"); without, the raw one;
    - the factors applied when there is a form;
    - the raw load with no target;
    - null on a blow and at a 0 share.
  - `RunePicker`: the cost after the effect and the trade-off, per payment; none for a blow; none for a dimmed rune (the current one, and a Pierce candidate on an Earth Bolt).
  - `RunePouchPanel`: each rune's raw cost.
  - `Readout`: the runes note per payment; no note without runes; the pool warning on a loaded cost; **(revision 2)** the easing line ("Attunement eases rune cost by 45%", and "(the most it can)" at the cap), and none without runes or at 0 ease.
  - The mana support line, with its amber colour when spend > refill, and none for a charge chain.
  - `lab-model.test.ts` and the Lab's Mana select (A).
- **E2E:** none new; every Delve spec passes.

## Docs and version
- **`CLAUDE.md`, the Runes bullet:** a passage on costs.
  - Each rune's `load` (by tier, `runes.json`) adds up over the runes acting on a move (`runeLoad`, `ResolvedAbility.load`).
  - **(revision 2)** Attunement in the move's elements (their mean) eases the sum: `load = raw × (1 − min(easeCap, easePerAttune × attunement))`, exposed as `ResolvedAbility.load` and `ease`. The builder says "Attunement eases rune cost by N%".
  - `resolveAbility` raises the price in the chain's payment: mana and a cast's mana × (1 + load); charge need × (1 + load × `charge`); a cast's channel × (1 + load × `cast`). No cooldown changes, and blows are free.
  - The factors live in `balance.json → delve.runes.load`.
  - `loadText` and `runeText`'s `cost` are the only formatters, and a dimmed rune shows no price.
  - Drain's cap is on `baseCost`.
  - Power nets the price through `useInterval` and the pool through `valuedChain`. `manaSupport` gives the builder's "Spends X/s · your build refills Y/s".
  - The two-build gate's numbers.
  - The spec's path joins the Delve section's spec list.
- **The DPS Lab bullet:** the Mana option (`DpsOptions.sustained`, starved or supported: the pool starts empty; supported's attunement, regen and Drain).
- **Version:** `chore(client): bump version to 0.52.0`. No save change: the load is data, and a socketed rune is still `{ id, tier }`.

## Open questions
These don't block the build; each is for the gate or for play.
- **(revision, settled in revision 2) How wide the starved/supported gap should be.** Half-gain loads left it at 0.24–0.39. The user chose easing by attunement; at the whole-gain loads it is 0.55–0.88 on the pack.
- **(revision 2) Volley starved on the pack, 1.34×.** Pierce's pack gain keeps it above the trap target. `byForm.volley` can't push it lower without breaking the band, so it stands unless the user wants Pierce's gain itself cut.
- **(revision 2) Attunement now pays three ways:** power (`powerPerAttune`), the pool and regen, and rune easing. If attuned heroes run away in the pacing rails, `easePerAttune` is the first lever.
- **Charge and cast conversions.** Both start at 1 and the gate doesn't cover them. A charge Ultimate (a Nova) at a load near 1 needs about twice the charge. Whether that feels like the same price as twice the mana is play's call.
- **Basic blows.** They are free by the user's call. If runed basics outpace runed abilities in play, a blow load is one more factor (`bySlot.basic`).

## Decided in the spec (index)
Items marked **(revision)** were added or changed after the spec, from the user's change to the gate and from the review.

1. The runes' loads add over the runes acting on a move (`ResolvedAbility.runes`); empty, unknown and dormant sockets, and Pierce on an infinite pierce, add nothing.
2. A cast chain's longer wind-up is its channel only; the conjure is untouched.
3. No cooldown is touched, the charge lockout included; a Defensive or an Ultimate costs more only through its payment.
4. Stacking is one product: Manaweaver's percentage × `castManaMult` × (1 + load); Manaweaver doesn't touch charge or channel.
5. A hold loads every stage alike; a cast hold's charging time absorbs its loaded channel as any wind-up does (accepted).
6. Echoes stay free; Echo's load is its price.
7. Drain's budget is half the move's cost before its load (`baseCost`), in the sim and in Power.
8. `load` is required on every rune row and never falls with tier.
9. `byForm` ships as `{}`, and a missing form counts as 1. **(revision)** Its keys are checked in `tests/delve-rune-costs.test.ts`.
10. Starting loads: the rune's best tier-III gain on the ability forms (the higher of one dummy and the pack), rounded up to the next 0.05. **(revision 2)** The whole gain, not half.
11. Tier steps × 0.6, 0.8, 1, 1.2, 1.4 of tier III (the shape of the decisions' Echo row as a rule; Echo is now [0.27, 0.36, 0.45, 0.54, 0.63]).
12. No rune is free: a floor at tier III, which Leech, Guard and Widen take. **(revision 2)** It is 0.20, doubled with the rest.
13. `ResolvedAbility.load` is exposed, after easing and before the payment's conversion; `baseCost(ab)` is exported.
14. `runeText` takes its price terms as a fourth argument and returns `cost`; `loadText` is the one formatter; whole percentages. **(revision 2)** The terms are an options object, `{ payment, ease }`.
15. The words: "+N% cost" (mana or unknown), "+N% charge", "+N% cast wind-up, +N% cost".
16. Blows show no cost line (null).
17. The builder's pay line appends "(runes: …)" from `loadText` when the load is above 0.
18. No new HUD element: its readiness already reads the loaded numbers.
19. The autopilot gets no new policy: Power nets the price through `useInterval`.
20. The Training Grounds pay, but their default toggles make mana and charge moot; a cast's channel still shows.
21. The Lab's sustained mode is one `DpsOptions` option on every view, not a fourth view; 30 s as every run.
22. The ceilings and their gate are unchanged. **(revision 2)** They are measured unloaded, as at v0.51.0, with the loaded full-mana ratios reported beside them.
23. **(revision)** The sustained gate measures two builds per Primary form on the pack: starved reported with no floor, supported at least 1.5×; one dummy reported.
24. The gate lives in the repo, skipped unless `RUNE_COST_GATE` is set, and covers mana chains only.
25. Tuning order: `byForm`, then `bySlot`, then **(revision 2)** `easePerAttune` / `easeCap`, then rune rows; never the ceilings, the floor, the band or the pacing rails; report when loads can't meet them.
26. "Drain never costs DPS" becomes "Drain adds DPS on some setup"; the `it.fails` direction test stays until it passes.
27. **(revision)** The build: step 1 (types, data, `resolveAbility`, `runeLoad`, `baseCost`, Drain's cap, `basicIncome`, `manaSupport`) ships with `bySlot` at 0 and every number identical; then A (the pool rule, the loads, the Lab end to end, gates, pacing; it owns `delve-rune-sim.test.ts`) and B (texts and client) in parallel.
28. **(revision)** In `resolve.ts` the load's variable is `load` (`L` is the legendaries).
29. **(revision)** The sim readers that follow the load unchanged: `canAfford`, `pressDue`'s `payable`, `startHold`, `releaseHold`'s fallback, `pay`, `cancelWindup`, `gainCharge`, Galvanize, Nightstalker, the no-cooldowns fill and `world.ts`'s clamp.
30. **(revision)** An uncastable runed mana Ultimate at a low pool is intended ("build around it"); the builder's warning names it ("Needs 87 mana; your pool holds 66." for a heavy mana Nova with Leech I at attunement 2).
31. **(revision)** Drain's tier-III load comes from the rule (1.36× in the Lab), not the floor. **(revision 2)** It is 0.40.
32. **(revision)** Quick can be a net loss on a mana-bound move in a starved build (accepted).
33. **(revision)** A dormant rune shows no price, by one rule: the caller hides the cost wherever it dims the rune, and dimming reads `ResolvedAbility.runes` (a candidate resolved in its socket); `runeText` stays dormancy-free.
34. **(revision)** The pouch shows each rune's raw cost beside its effect (the no-target branch).
35. **(revision)** `manaSupport(registry, stats, chain) → { spend, refill }`, with `basicIncome` factored out of `estimateCombat`; it replaces only `income + blowDrain / strikeInterval` inside `manaIncome`, and `income` stays for `drained()`. Refill counts the basics at their full rate, as Power does, and spend ignores the pool cap. The builder shows "Spends X/s · your build refills Y/s", amber when spend > refill, for mana and cast chains.
36. **(revision)** Power and the pool: `valuedChain` cuts a chain after its first move the pool can't pay (no damage, `comboWindow` seconds); a hold is valued at its highest affordable stage. `runeLeech` and the Defensive's effect read it too. It can move Power without runes only for over-pool moves, recorded separately in pacing.
37. **(revision)** Accepted: the mana split. Power's fixed income shares can value a mana Ward that a loaded Primary starves in the sim; the pacing rails are the guard.
38. **(revision)** `DpsOptions.sustained: 'starved' | 'supported'`. Starved is the Lab's plain hero (pool 63, regen 4.2). Supported adds +14 primary and +5 secondary attunement (pool 120), +30% Mana Regen (regen 10.4) and Drain III in every basic blow; no Manaweaver. It comes from the autopilot's dive-12 heroes.
39. **(revision)** The gate's set is ranked unloaded (`bySlot` zeroed) and measured loaded: Echo + Heavy + Linger for Bolt, Lance, Burst and Strike; Pierce + Echo + Heavy for Volley.
40. **(revision)** Mana per press (2.0–3.0×) is a check that loads matter, gross of Drain's refund. **(revision 2)** It is measured on the starved hero, at full price; the supported hero's (2.07×) is reported.
41. **(revision)** A reported check that the price bites: each loaded sustained ratio is below its loads-zeroed one.
42. **(revision)** The Lab session key and signatures: `remember` / `recall(depth, pack, sustained, …)`, key `depth|pack|sustained|dpsKey`, and the `lab-model.test.ts` update.
43. **(revision 2)** Attunement eases rune load: `load = raw × (1 − ease)`, with `ease = min(easeCap, easePerAttune × the move's mean attunement)`, as `attunePower` averages. It is applied once to the sum.
44. **(revision 2)** `easePerAttune` 0.03 and `easeCap` 0.6 (at most 1) live in `delve.runes.load`. A starting hero is eased 3%, the supported build 45%, and attunement 20 or more 60%.
45. **(revision 2)** `ResolvedAbility.ease` is exposed beside `load`; `loadEase(registry, stats, elements)` lives in `loot/runes.ts`, in step 1.
46. **(revision 2)** `runeText` takes the move's ease, not the stats, and shows the eased figure when the ease is known; the pouch shows the raw, uneased price.
47. **(revision 2)** The builder's readout adds "Attunement eases rune cost by N%", with "(the most it can)" at the cap.
48. **(revision 2)** The starved target (about 0.9–1.2×) is reported, not gated; Volley's 1.34× on the pack is accepted.
49. **(revision 2)** Tier V's heaviest set (4.60× the mana for a starting hero, 2.48× at the cap) is out of a starting hero's reach by design.
50. **(revision 2)** The bot's curve: a fresh hero's runes mostly net negative, so they wait until attunement eases them; the dive-6 mean is expected to drop most.
