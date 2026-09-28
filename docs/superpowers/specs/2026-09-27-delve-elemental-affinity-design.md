# Delve Elemental Affinity Design

**Date:** 2026-09-27
**Status:** Approved in conversation.

**Engine:** `packages/engine/src/`
- `delve/pair.ts` (new)
- `delve/profile.ts`, `delve/profile-schema.ts`, `delve/hero-stats.ts`, `delve/dive.ts`, `delve/autopilot.ts`
- `loot/item-generator.ts`, `loot/drops.ts`, `loot/smithing.ts`
- `arpg/basic.ts`, `arpg/world.ts`, `arpg/sandbox.ts`, `arpg/abilities/resolve.ts` (`defaultAbilities`)
- `types/delve.ts`
- `data/balance.json`, `data/delve.json` (Prism text), `data/schemas.ts`
- `index.ts`

**Client:** `packages/client/src/`
- `features/delve/ManaChoice.tsx` (new), `features/delve/BindPrompt.tsx` (new), a Mana view in `features/delve/`
- `features/delve/AbilitiesPanel.tsx`, `ItemDetailSheet.tsx`, `PaperDoll.tsx`, `PickupFeed.tsx`, `LootTray.tsx`, `BagPanel.tsx`
- `features/delve/arena/useArena.ts`, `arena/fx/anticipation.ts`, `arena/fx/draw-world.ts`, `arena/ArenaRenderer.ts`
- `pages/DelveCamp.tsx`, `pages/DelveRun.tsx`, `pages/MainMenu.tsx`
- `stores/delveStore.ts`, `stores/sandboxStore.ts`, `features/delve/training/TrainingPanel.tsx`

**Depends on:** Delve infusion visuals (`2026-09-27-delve-infusion-visuals-design.md`), built first. This spec fills `HeroWeapon.infusion` from the hero's pair and refines what each blow draws.

## Goal

Give each hero an elemental identity:

- You start with one mana type (your **primary**) and, over the Delve, bind a second (your **secondary**). You are limited to those two.
- The more you invest in each through gear and smithing, the stronger it gets.
- A secondary you invest in enough overtakes the primary.
- Basic attacks strike with your primary, and the combo's finisher discharges your secondary, so combos set up and detonate reactions.
- Abilities are built from your pair.

## Decisions

| Question | Decision |
|---|---|
| Starting element | **Chosen on first visit.** A one-time "Choose your mana" screen; the equipped starting gear is attuned to it and the starting abilities use it. Existing saves take their highest attunement. |
| Second element | **A deliberate bind**, between dives, for free. Once bound, the pair is set. **Realign** (between dives, paid) changes it. |
| Overtaking | **Between dives, with a margin.** The swap happens when a dive closes, if the secondary's attunement is above zero and above 1.2 × the primary's. |
| Basic attacks | **The finisher becomes the secondary.** Blows strike with the primary. The string's last blow deals the secondary's element and always applies its status. |
| Abilities | **Only your two** (and their fusion) in the Delve. The Training Grounds stays unrestricted. |
| Off-pair gear | **Useful, and a source of Mana Dust.** It keeps its stats but gives no attunement. Salvaging it gives Mana Dust, a new resource for elemental crafting. Drops lean toward your pair. |
| Weapon mana | **Only investment.** A weapon's mana feeds attunement; your primary decides your basic element. |
| Naming | The hero's two elements are `profile.pair`. "Affinity" already means an item's mana in the code. |

## Engine

### Profile (save version 4)

`DelveProfile` gains:

- `pair: { primary: ManaType | null; secondary: ManaType | null }`. `primary` is `null` only before the choice.
- `manaDust: number`.

Zod checks that `secondary` is null unless `primary` is set, and that it differs from `primary`.

**Save migration:**
- **Entry point:** `parseDelveProfile(registry, raw)` (it gains the registry, which picking the primary needs) returns `{ profile, fixed } | null`, where `fixed` lists the build slots the migration changed. The store shows the notice from it. Callers update: `delveStore.loadDelveProfile`, `delve-dive.test.ts`, `delve-profile-abilities.test.ts`.
- **Chain:** a frozen `DelveProfileV3Schema` is kept, so version 2 saves migrate v2 → v3 → v4.
- **Primary:** the element with the highest total attunement from equipped gear.
  - Ties go to the weapon's mana, then the first in `MANA_TYPES` order.
  - With nothing equipped, `primary` stays `null` and the choice screen shows.
- **Secondary:** `null`.
- **Mana Dust:** 0.
- **Builds:** fixed to the pair right away (below). A save migrated mid-dive keeps its dive; the builds change.

### Pair module (`src/delve/pair.ts`)

Every op returns `ProfileActionResult` (`{ ok, profile, reason }`, like smithing), so the client can show reasons such as "Not enough Mana Dust". Every op except the choice refuses while a dive is active (`isDiveActive`).

- **`chooseStartingMana(registry, profile, mana)`:**
  - Only while `primary` is `null`.
  - Sets `primary`, and re-attunes every **equipped** item to `mana` for free, converting its lines (below). The bag is untouched.
  - Sets `abilities` to `defaultAbilities(mana)`.
- **`bindSecondary(profile, mana)`:**
  - Only while `secondary` is `null` and `primary` is set; `mana` must differ from the primary.
  - Free.
- **`realign(registry, profile, { primary?, secondary? })`:**
  - Needs a bound pair and a change: the two must differ, and a no-op is refused.
  - Costs `pair.realignDust` Mana Dust plus `pair.realignScrap` scrap.
  - Gear is untouched.
  - Builds are fixed to the new pair.
- **`inPair(profile, mana)`:** whether `mana` is the primary or the bound secondary. It is always `true` when `primary` is `null`.
- **`resolveOvertake(registry, profile)`:**
  - The swap needs a bound secondary with `att[secondary] > 0` and `att[secondary] > overtakeMargin × att[primary]` (strict), using the pair-filtered attunement from `profileStats`.
  - It returns `{ profile, swapped }`.
  - The client's store calls it right after `closeDive` and shows a notice when `swapped`. The autopilot calls it too. The engine's `closeDive` is unchanged.
- **`reattuneItem(registry, profile, uid, mana)`:**
  - The target must be in the pair and differ from `item.mana`.
  - Costs `pair.reattuneDust[rarity]` Mana Dust.
  - Changes `item.mana` to `mana` and converts only the lines of the old mana: `${old}Attune` ↔ `${new}Attune`, and `${old}Power` ↔ `${new}Power`. If the item already has a line of the new element, the two swap elements, so there is still one line per stat.
- **`fixBuildsToPair(profile)`:**
  - Keeps each slot's in-pair elements (`[storm, frost]` with the pair {fire, storm} → `[storm]`).
  - A slot left with none becomes `[primary]`. Form, weight and payment are kept.
  - Runs on choose, realign and migration (and in the autopilot), and returns the changed slots for a notice.
  - Binding and overtaking never invalidate builds.
- **`profileStats(registry, profile)`:** `computeHeroStats(profile.equipped, registry, { pair: profile.pair, filterAttunement: true })`. It is the one way to get a hero's real stats (below).
- **`salvageDust(registry, item, pair)`:** `pair.salvageDust[rarity]` if `item.mana` is not in the pair, else 0.

### Stats (`hero-stats.ts`)

`HeroStatsExtra` gains two fields:

- **`pair?: { primary: ManaType | null; secondary: ManaType | null }`** (basic attacks). A `secondary` equal to the `primary` counts as unbound. With a `primary`:
  - `weapon.element` is the primary, even when unarmed (you punch with your primary);
  - `weapon.infusion` is the bound secondary, or `null`.
  - `HeroWeapon` gains two precomputed multipliers, both 1 without a pair primary. `basic.ts` and `estimateCombat` both read them, so they can't drift apart:
    - `blowPower = 1 + basicPowerPerAttune × att[primary]`;
    - `finisherPower = 1 + basicPowerPerAttune × att[secondary]` (equal to `blowPower` with no secondary).
  - This replaces the infusion spec's `basicInfusion` extra, which becomes `pair.secondary`.
- **`filterAttunement?: boolean`** (the two-element limit). When true and `pair.primary` is set, attunement accumulates **per element**, only for the primary and the bound secondary:
  - an item's base attunement counts if its mana is in the pair;
  - each `${el}Attune` line counts toward its own element if that element is in the pair;
  - Prism adds to the pair only;
  - everything else about an item (its other stats) always counts.

**Callers switch to `profileStats`** (or pass the pair to):
- `profile.ts`: `compareItem`, `heroPower`, `profilePower`, `equipBest`, `salvageCandidates`;
- `dive.ts`: `beginFloor`, `heroMaxHp`;
- the autopilot's floor refresh;
- the client: `useArena` (the mid-dive hot-swap), `PaperDoll`, the Anvil's `AbilitiesPanel` wrapper, `DelveCamp`'s attunement, `MainMenu`'s Power, and `compareItem` in `PickupFeed`, `LootTray`, `BagPanel` and `ItemDetailSheet`.

`compareItem` and `heroPower` gain a `pair` parameter.

**`estimateCombat` values the pair:**
- ordinary blows use `weapon.blowPower × (1 + elementPower[primary])`;
- the finisher's share of the string's power uses `weapon.finisherPower × (1 + elementPower[secondary])`, when bound;
- so Power, ▲ upgrade marks, salvage candidates and the bot's gear choices value investment.

### Basic attacks (`basic.ts`)

With `weapon.infusion` set (a bound secondary):

- **Ordinary blows** (every step but the string's last) strike with the primary, at `× weapon.blowPower`, with the usual 30% primary status roll.
- **The finisher:**
  - deals its damage as the **secondary** element, at `× weapon.finisherPower`;
  - skips the primary's status roll and **always** applies the secondary's basic status (subject to normal immunities);
  - resist and weakness, reactions and element power all use the secondary.
- **Twin Fang's extra hit** on the finisher uses the secondary element and its power.
- **Ranged finisher:** its shot carries the secondary as its `element` (and so does the staff's great orb burst).
- **Without a secondary:** every blow, the finisher included, is a primary blow with the primary's power.
- **Without a pair `primary`:** basics work exactly as today (the weapon's mana, no attunement power).

### Abilities and defaults

- **`setAbility`:** keeps its current contract (returns the profile, throws on a bad build). It also throws for elements outside the pair when `primary` is set; the picker only ever offers the pair. `resolveAbility` is unchanged.
- **`defaultAbilities(element)`:** now gives the Ward the same element, where it used to be hard-coded frost. New heroes, the choice screen and the Training Grounds defaults all use it.

### Loot

- **Pair in the drop context:** `LootContext` and `DropContext` gain `pair: ManaType[]` (the primary, plus the secondary if bound; empty with no primary). `generateItem` passes it to `rollMana`.
- **`rollMana`:**
  - with an empty pair: exactly today's rolls, with no extra random draw, so existing seeded streams are unchanged;
  - otherwise, with chance `dropBias` (0.6) the item takes a pair element: the primary with chance `primaryShare` (0.6) when both are bound, else the primary;
  - otherwise today's biome bias and uniform roll.
  - In-pair rate: `dropBias + (1 − dropBias) × (biomeBias × [biome ∈ pair] + (1 − biomeBias) × |pair| / 6)`.
- **Sandbox:** its `LootContext` gets `pair: []`.
- **Mana Dust from salvage:** every salvage path adds `salvageDust` to `profile.manaDust`: `salvageItems` (it returns `{ scrap, dust }`), auto-salvage in `addLootToBag`, and bag-full melts. `BankResult` gains `dust`.
- **Prism's text:** "+{v} to the Attunement of your two elements."

### Balance (`balance.json → delve.pair`, Zod-validated)

| Key | Value |
|---|---|
| `overtakeMargin` | 1.2 |
| `basicPowerPerAttune` | 0.03 |
| `dropBias` | 0.6 |
| `primaryShare` | 0.6 |
| `salvageDust` | common 1, uncommon 2, magic 3, rare 5, epic 8, legendary 15 |
| `reattuneDust` | common 2, uncommon 3, magic 5, rare 8, epic 12, legendary 20 |
| `realignDust` | 60 |
| `realignScrap` | 200 |

### Autopilot and pacing

- **New profiles:** `createDelveProfile(registry, seed, opts?: { primary?: ManaType })`. With `primary`, it runs `chooseStartingMana`. The player's new save omits it, so the choice screen shows. The bot and the E2E pass `{ primary: 'fire' }`.
- **Binding:** between dives, before `visitForge` salvages anything, the bot binds the non-primary element with the most attunement across its equipped and bagged items, and skips the bind while every such total is 0. That total is each item's base attunement for its mana, plus matching `${el}Attune` lines; ties break in `MANA_TYPES` order. It then sets its Primary build to `[primary, secondary]`, so it keeps finding reactions.
- **Overtake:** the bot calls `resolveOvertake` after each dive closes.
- **Pacing guard rails** (`tests/delve-pacing.test.ts`) must hold. Add a second, smaller run with a Frost primary (2 seeds, via a new `AutopilotOptions.primary`), which must still progress (dive 12 at least 5 deeper than dive 1). Tune in this order:
  1. `basicPowerPerAttune`;
  2. `dropBias`;
  3. `mana.poolPerAttune`;
  4. monsters, only as a last resort.

## Client

- **Gating:** "between dives" means `!isDiveActive(profile)`, not "on the Anvil page". The Anvil can be reached mid-dive, and the item sheet is shared with the run. While a dive is active, the bind prompt, the Mana view's Bind and Realign, and Re-attune are disabled, with the reason shown.
- **Choose your mana** (`ManaChoice.tsx`):
  - A full-screen modal on the Anvil whenever `pair.primary` is `null`, with `data-pad-scope` for the controller.
  - Six cards, one per element, each with its colour, icon and a one-line play style (Fire burns, Frost controls, Storm chains, Earth staggers, Shadow hexes, Nature poisons), plus its basic status and fusions.
  - Choosing calls `chooseStartingMana`.
- **Mana view** at the Anvil, built on the existing `AttunementBars`:
  - primary and secondary, with their attunement;
  - the overtake progress: the secondary against 1.2 × the primary;
  - Mana Dust;
  - **Bind a second element**, when unbound: lists elements you own gear in (equipped or bag), shows the Power with the bind applied, and asks for confirmation;
  - **Realign**, with its cost.
- **Bind prompt** (`BindPrompt.tsx`, `data-pad-scope`, "Not now" carries `data-pad-back`):
  - Equipping an item whose mana is outside the pair while the secondary is unbound and no dive is active asks "Bind Storm as your second element?", with the Power either way.
  - **Bind:** binds, then equips. **Not now:** equips (stats only). The choice is remembered for the session (not saved), so it doesn't ask again.
  - "Equip best" never prompts.
  - During a dive, such an equip just equips, with a toast: "Bind Storm between dives to draw power from it".
- **Item cards:** base attunement and `*Attune` lines outside the pair are greyed ("not your element"). The salvage preview shows its Mana Dust.
- **Smithing sheet:** gains **Re-attune**, a choice of your pair's elements other than the item's, showing the Mana Dust cost.
- **Abilities panel:** in the Delve, the element picker offers only the pair.
- **Notices** (toasts wherever the player is):
  - overtake: "Storm now outweighs Fire: your basic attacks strike with Storm";
  - fixed builds on migration or realign: "Your Maelstrom used Frost, which isn't in your pair; it now uses Fire".
- **What basic blows draw** (refines the infusion spec):
  - ordinary blows draw the primary body with the secondary's motif;
  - the finisher's body is the secondary (its `element`), with no extra motif, plus the discharge ring in the secondary's motif at strength 1.5;
  - a basic shot draws the infusion motif only when its `element` differs from `weapon.infusion`, so a finisher's secondary-bodied shot doesn't draw it twice;
  - the finisher's wind-up tint (`anticipation.ts`) uses the secondary's colour;
  - a ranged finisher, which has no swing tip, draws its discharge ring at the shooter's hand when released (a release flare, radius about 0.6, strength 1.5, in the secondary's motif);
  - the same "motif only when the element differs from the infusion" guard applies in the engine's `burstShot`, so a ranged finisher's great-orb burst doesn't carry the secondary as an infusion on a secondary body.
- **Training Grounds:**
  - The sandbox store gains a saved `primary: ManaType` (default: the default weapon's element, fire), with its own picker in the Loadout tab ("Your primary: what your blows strike with"). `weapon.mana` stays the item's mana.
  - The sandbox passes a basics-only pair: `pair: { primary, secondary: basicInfusion }`, `filterAttunement: false`. So the finisher discharge really works there, unarmed included, and every element still counts toward attunement (it stays unrestricted).
  - The Basic infusion picker's label becomes "Your combo finisher discharges this element."
  - **Load my build** also sets the sandbox's `primary` to your primary and Basic infusion to your secondary. The loaded weapon item and its real mana are kept, which the store's weapon check relies on.

## Testing

Engine (TDD, `tests/delve-pair.test.ts`):

- **Migration:** v2 → v3 → v4. The primary is the highest attunement (weapon on ties, then `MANA_TYPES` order; `null` with nothing equipped); the secondary is `null`; Mana Dust is 0; builds are fixed.
- **`chooseStartingMana`:** it sets the primary, re-attunes equipped items only, converts lines, resets abilities to `defaultAbilities(mana)` (Ward included), and refuses a second call.
- **`bindSecondary`:** it refuses the primary, a second bind, and an active dive.
- **`realign`:** it charges Mana Dust and scrap; it refuses no-ops, the same element twice, an unbound pair, too little currency, and an active dive; it fixes builds.
- **`resolveOvertake`:** it swaps only when `secondary > 0` and `secondary > 1.2 × primary`; never when both are 0.
- **`reattuneItem`:** it converts the mana and old-element lines, swapping on a collision; it charges Mana Dust; it refuses off-pair targets and the item's own mana.
- **Attunement filter:** per element (an off-pair item's in-pair `*Attune` line still counts; an in-pair item's off-pair line doesn't); Prism covers the pair only; with no primary or `filterAttunement: false`, every element counts.
- **Basics:**
  - Blows strike with the primary. The finisher strikes with the secondary and always applies its status (fire blows then a storm finisher on a burning foe gives Overload).
  - Twin Fang follows the finisher.
  - A ranged finisher shot carries the secondary.
  - Unarmed punches with the primary.
  - Without a secondary, the finisher stays the primary.
  - Power per attunement applies to each.
- **`estimateCombat`:** its value rises with primary attunement, and with secondary attunement once bound.
- **`setAbility`:** it refuses off-pair elements. `fixBuildsToPair` keeps in-pair elements and fills empty slots with the primary.
- **Loot:**
  - With an empty pair the drop streams are unchanged (a seeded equality check).
  - With a pair, the in-pair rate matches the formula within tolerance.
  - Every salvage path adds Mana Dust for off-pair items only.
- **Autopilot:** it binds before salvaging, adds the secondary to its Primary build, and calls overtake.
- **Pacing:** both runs (fire, and the Frost check) pass.

Client:

- the choice screen (shown when `primary` is `null`; calls the op; controller scope);
- the Mana view (bars, overtake progress, bind and realign, disabled during a dive);
- the bind prompt (the Power shown, Bind and Not now, remembered for the session; no prompt during a dive, a toast instead; none on Equip best);
- Re-attune in the smithing sheet;
- the pair-limited element picker;
- the notices;
- the per-blow basic visuals;
- the Training pair.

Store and page tests that create profiles (`DelveCamp.test.tsx`, `ItemDetailSheet`, `AbilitiesPanel` and store tests) seed a pair, through `resetProfile(seed, primary)`. The default Ward now takes the primary's element, so the "Frost Ward" assertions change: `delve-dive.test.ts`, `AbilitiesPanel.test.tsx`, and `e2e/delve.spec.ts` (`'Defensive: Frost Ward'`).

E2E:

- A new save shows the choice screen. Choosing Frost starts you with frost gear and frost abilities.
- The existing Delve and Training suites seed a pair and pass.

## Delivery

Engine first (profile, pair ops, stats, basics, loot, autopilot), then the pacing gate, then the client. Shipped as **v0.43.0**, after infusion visuals (v0.42.0).

The CLAUDE.md Delve section gets an Elemental affinity bullet, and its "schema version 3" line becomes 4.

## Out of scope

- Shops, and new sources of investment beyond gear and smithing.
- More than two elements.
- Changing the pair mid-dive.
- Retuning the base status chance of ordinary blows (30%).
- Reviving element-bound legendaries off-pair (Stormcaller, Rimeheart, Bedrock and Nightstalker only work with their element in your pair).
