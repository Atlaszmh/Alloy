# Delve Elemental Affinity Design

**Date:** 2026-09-27
**Status:** Approved in conversation.

**Engine:** `packages/engine/src/`
- `delve/affinity.ts` (new)
- `delve/profile.ts`, `delve/profile-schema.ts`, `delve/hero-stats.ts`, `delve/dive.ts`, `delve/autopilot.ts`
- `loot/item-generator.ts`, `loot/drops.ts`, `loot/smithing.ts`
- `arpg/basic.ts`, `arpg/combat.ts`, `arpg/world.ts`
- `types/delve.ts`
- `data/balance.json`, `data/schemas.ts`
- `index.ts`

**Client:** `packages/client/src/`
- `features/delve/` (a new mana choice screen, a Mana view, the bind prompt, the item card and smithing sheet, `AbilitiesPanel.tsx`)
- `pages/DelveCamp.tsx`, `pages/DelveRun.tsx`
- `stores/delveStore.ts`, `stores/sandboxStore.ts`

**Depends on:** Delve infusion visuals (`2026-09-27-delve-infusion-visuals-design.md`). This spec fills `HeroWeapon.infusion` in real play.

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
| Starting element | **Chosen on first visit.** A one-time "Choose your mana" screen; the starting gear is attuned to it. Existing saves take their highest attunement. |
| Second element | **A deliberate bind.** A prompt at the Anvil: "Bind Storm as your second element?" Once bound, the pair is set. **Realign** at the Anvil changes it, at a high cost. |
| Overtaking | **Between dives, with a margin.** The swap happens only if the secondary's attunement is at least 1.2 × the primary's. It is checked when a dive closes. |
| Basic attacks | **The finisher becomes the secondary.** Blows strike with the primary. The string's last blow deals the secondary's element and always applies its status. |
| Abilities | **Only your two** (and their fusion) in the Delve. The Training Grounds stays unrestricted. |
| Off-pair gear | **Useful, and a source of Mana Dust.** It keeps its stats but gives no attunement. Salvaging it also gives **Mana Dust**, a new resource for elemental crafting. Drops lean toward your pair. |
| Weapon mana | **Only investment.** A weapon's mana feeds attunement; your primary decides your basic element. |

## Engine

### Profile (save version 4)

`DelveProfile` gains:

- `affinity: { primary: ManaType | null; secondary: ManaType | null }`. `primary` is `null` only before the choice.
- `manaDust: number`.

The profile schema goes from version 3 to version 4. Migrating a version 3 save:

- **Primary:** the highest total attunement from equipped gear. Ties go to the weapon's mana. If the save has no attunement at all, `primary` stays `null` and the choice screen shows.
- **Secondary:** `null`. The Anvil offers the bind (below).
- **Mana Dust:** 0.
- **Abilities:** kept as they are. They are fixed when the next dive starts (below).

### Affinity module (`src/delve/affinity.ts`)

- **`chooseStartingMana(registry, profile, mana)`:**
  - Sets `primary`, and changes the mana of every equipped and bagged item to `mana`, converting their element-bound lines (below).
  - Only allowed while `primary` is `null`.
- **`bindSecondary(profile, mana)`:**
  - Sets `secondary` (it must differ from the primary).
  - Only allowed while `secondary` is `null` and outside a dive.
- **`realign(registry, profile, { primary?, secondary? })`:**
  - Changes one or both elements (they must differ), for `affinity.realignDust` Mana Dust plus `affinity.realignScrap` scrap.
  - Only allowed outside a dive.
- **`inPair(profile, mana)`:** whether `mana` is the primary or the bound secondary.
- **`resolveOvertake(registry, profile)`:**
  - Called when a dive closes (`closeDive`).
  - If the secondary is bound and its attunement is at least `affinity.overtakeMargin` (1.2) × the primary's, the two swap.
  - Returns the new profile and a `swapped` flag for the client's notice.
- **`reattuneItem(registry, profile, uid, mana)`:**
  - Changes an item's mana to `mana`. The target must be in the pair, or the primary or any element while the secondary is unbound; choosing a non-primary element then requires binding it first.
  - It costs `affinity.reattuneDust[rarity]` Mana Dust.
  - It converts the item's element-bound lines: `<old> Attune` → `<new> Attune`, and `<old> Damage` → `<new> Damage`, same values.
  - Only allowed outside a dive.
- **`fixBuildsToPair(profile)`:**
  - Runs when a dive starts. It rebuilds any ability slot using an element outside the pair: its elements become `[primary]`, and its form, weight and payment are kept.
  - It reports the changed slots for a notice.

### Attunement counts only for the pair

- **Pair rule:** `computeAttunement` takes the affinity. When a `primary` is set, only the primary and the bound secondary accumulate attunement.
  - Items of other elements still give all their non-attunement stats.
  - Prism adds to the pair only.
  - With no `primary` (the Training Grounds, or before the choice), every element counts as today.
- **Consequence:** the mana pool, ability power and masteries follow, because they read attunement.

### Basic attacks

`computeHeroStats` takes the affinity (through `HeroStatsExtra.affinity`). With a `primary`:

- **Weapon fields:** `weapon.element` is the primary (not the item's mana), and `weapon.infusion` is the bound secondary (or `null`).
- **Every blow except the finisher** strikes with the primary, at `× (1 + affinity.basicPowerPerAttune × attunement[primary])`. `basicPowerPerAttune` is 0.03, in balance.json.
- **The finisher** (the string's last step), when a secondary is bound:
  - it deals its damage as the **secondary** element, at `× (1 + basicPowerPerAttune × attunement[secondary])`;
  - it **always** applies the secondary's basic status (the same table as today's weapon statuses), subject to normal immunities;
  - its hit carries the secondary as its element, so resist and weakness, reactions and element power all use the secondary.
  - Without a secondary, the finisher is a normal primary blow.
- **Twin Fang:** its extra hit on the finisher uses the finisher's element.
- **Ranged:** a ranged finisher's shot carries the secondary element and the guaranteed status. The staff's great orb burst uses it too.
- **The rest:** without an affinity `primary`, basics work exactly as today.

### Abilities

- **`setAbility` rule:** it refuses elements outside the pair when a `primary` is set. With the secondary unbound, only the primary is allowed.
- **Resolving:** `resolveAbility` is unchanged. Attunement already powers abilities, and it now counts only the pair.

### Loot

- **Drops lean toward the pair:** `LootContext` gains `pair: ManaType[]` (the primary, plus the secondary if bound). `rollMana` rolls the pair with chance `affinity.dropBias` (0.6); the primary takes 60% of those rolls when both are bound. Otherwise the existing biome bias and uniform roll apply.
- **Mana Dust from salvage:** salvaging an item whose mana is not in the pair (with auto-salvage included) also gives `affinity.salvageDust[rarity]` Mana Dust, alongside the usual scrap.

### Balance (`balance.json → delve.affinity`, Zod-validated)

| Key | Value |
|---|---|
| `overtakeMargin` | 1.2 |
| `basicPowerPerAttune` | 0.03 |
| `dropBias` | 0.6 |
| `salvageDust` | common 1, uncommon 2, magic 3, rare 5, epic 8, legendary 15 |
| `reattuneDust` | common 2, uncommon 3, magic 5, rare 8, epic 12, legendary 20 |
| `realignDust` | 60 |
| `realignScrap` | 200 |

### Autopilot

- **Primary:** `createDelveProfile` for the bot sets the primary to the starting weapon's mana (fire).
- **Secondary:** between dives, the bot binds the most-attuned non-primary element among its equipped and bagged items, once any exist.
- **Gear:** it equips by the Power estimate, which now reflects the pair rule.
- **Pacing:** `tests/delve-pacing.test.ts` must hold. Tune in this order:
  1. `basicPowerPerAttune`;
  2. `dropBias`;
  3. monsters, only as a last resort.

## Client

- **Choose your mana** (`features/delve/ManaChoice.tsx`):
  - It is a full-screen modal on the Anvil whenever `affinity.primary` is `null`.
  - It offers six cards, one per element, each with its colour, icon and a one-line play style (Fire burns, Frost controls, Storm chains, Earth staggers, Shadow hexes, Nature poisons), plus its basic status and its fusions.
  - Choosing calls `chooseStartingMana`.
- **Mana view** at the Anvil (a new tab or panel):
  - your primary and secondary, with attunement bars for each;
  - the overtake progress: the secondary against 1.2 × the primary;
  - Mana Dust;
  - **Bind a second element**, when unbound: it lists the elements you own gear in, and asks for confirmation;
  - **Realign**, with its cost.
- **Bind prompt:** equipping, at the Anvil, an item whose element is outside the pair while the secondary is unbound asks "Bind Storm as your second element?".
  - Bind: binds it, then equips.
  - Not now: equips without binding (stats only).
  - Mid-dive, equipping such an item just equips it, with a toast: "Bind Storm at the Anvil to draw power from it".
- **Item cards:** an item outside the pair shows "No attunement (not your element)", and its salvage preview shows the Mana Dust.
- **Smithing sheet:** gains **Re-attune** (choose an element in your pair; shows the Mana Dust cost).
- **Abilities panel:** the element picker offers only the pair in the Delve (unchanged in the Training Grounds).
- **Notices:**
  - an overtake: "Storm now outweighs Fire: your basic attacks strike with Storm";
  - fixed builds at a dive start: "Your Maelstrom used Frost, which isn't in your pair; it now uses Fire".
- **Training Grounds:** "Load my build" also copies the pair. The weapon element picker shows your primary, and Basic infusion shows your secondary. The sandbox stays unrestricted, and its stats pass no affinity, so every element counts there.

## Testing

Engine (TDD, `tests/delve-affinity.test.ts`):

- **Migration:** v3 → v4 takes the highest attunement (weapon on ties, or `null` with none); the secondary is `null`; Mana Dust is 0.
- **`chooseStartingMana`:** it sets the primary, re-attunes the starting gear, converts element-bound lines, and refuses a second call.
- **`bindSecondary`:** it refuses the primary, a second bind, and a bind mid-dive.
- **`realign`:** it charges Mana Dust and scrap, refuses when unaffordable or mid-dive, and refuses the same element twice.
- **`resolveOvertake`:** it swaps at 1.2 × and not below.
- **Attunement:** only the pair counts (Prism included); with no primary, every element counts as today.
- **Basics:**
  - Blows strike with the primary.
  - The finisher strikes with the secondary and always applies its status. That sets up and triggers a reaction: fire blows then a storm finisher on a burning foe gives Overload.
  - Without a secondary, the finisher stays the primary.
  - The power per attunement applies to both.
- **`setAbility`:** it refuses off-pair elements; `fixBuildsToPair` rebuilds only the off-pair slots.
- **Loot:**
  - Drops lean toward the pair at about 60% (a seeded sample).
  - Salvaging an off-pair item gives Mana Dust; salvaging an in-pair one doesn't.
  - Re-attune converts the item's mana and lines, charges Mana Dust, and refuses off-pair targets.
- **Pacing guard rails:** they pass.

Client:

- the choice screen (shown when `primary` is `null`, and calls the op);
- the Mana view (bars, overtake progress, bind and realign flows);
- the bind prompt on equip;
- the mid-dive toast;
- Re-attune in the smithing sheet;
- the element picker limited to the pair;
- the overtake and fixed-build notices.

E2E:

- A new save shows the choice screen. Choosing Frost starts you with frost gear.
- The existing Delve suites seed a profile with an affinity, so they pass.

## Delivery

Shipped as **v0.43.0**, after infusion visuals (v0.42.0). The CLAUDE.md Delve section gets an Elemental affinity bullet.

## Out of scope

- Shops, and new sources of investment beyond gear and smithing.
- More than two elements.
- Changing the affinity mid-dive.
- Hiding undiscovered fusions or reactions in the choice screen.
