# Delve Ability System Design

**Date:** 2026-09-25
**Status:** Built in v0.33.0 (approach A). Details below were settled by Claude while the owner was away, for review.
**Replaces:** the 3-slot spell bar and its 15 fixed spells (`arpg.json → skills`), per-element mana pools, and attunement-gated spell unlocks.
**Engine:** `packages/engine/src/arpg/`, `src/delve/`, `src/data/arpg.json`, `balance.json → delve.abilities`
**Client:** `packages/client/src/features/delve/` (arena HUD, renderer, camp)

## Scope

This is project 1 of 2. It builds the ability system itself and ships it with every part open in a workshop. Project 2 (later, separate spec) gates the parts behind progression: XP, crafting materials, evolving abilities, and how gear unlocks them. Hand-made "showpiece" abilities (a real meteor shower for a Fire ultimate, say) are also later; the design leaves room for them.

## Decisions

| Question | Decision |
|---|---|
| Elements | Six: Fire, Frost, Storm, Earth, Shadow, and new **Nature** (poison, roots, growth). 15 pairs. |
| Resource | **One mana pool.** The basic attack generates it; the other abilities spend it. |
| Basic attack | **Automatic** (as today). The **weapon** decides its form and element. |
| Aiming | **Auto-aim** by default; drag from a button (phone) or hold its key and point (desktop) to place it. |
| Payment | **Mana, charge or cast time**, chosen per ability for Primary, Defensive and Ultimate. |
| First release | An **Abilities workshop** at the Anvil with every part open. |
| Architecture | **Assembled from parts**: an ability is a recipe of form + element(s) + weight + payment, compiled to plain numbers that the combat code reads. |

## The four slots

1. **Basic** (automatic, from the weapon). Melee weapons swing a three-hit combo: hits 1 and 2 as today, hit 3 deals 1.5× damage in a 60° wider arc with a small knockback. Staves and wands fire bolts as today. A new **bow** fires fast arrows that pierce. The weapon's element colours it (status chance as today). Every basic hit adds `basicGain` mana.
2. **Primary**: the build's main attack. Cheap, short cooldown, and **combos**: pressing again within `comboWindow` steps through the form's combo (e.g. a bolt goes small, small, medium, large).
3. **Defensive**: shield, armour, buff or evasion.
4. **Ultimate**: the big AoE payoff.

Keys: Q Primary, E Defensive, R Ultimate (F potion as today). On phones, three buttons in the bottom bar.

## An ability

```ts
type AbilitySlot = 'primary' | 'defensive' | 'ultimate';
interface AbilityBuild {
  form: FormId;                                   // must belong to the slot
  elements: [ManaType] | [ManaType, ManaType];    // two distinct = a fusion
  weight: -2 | -1 | 0 | 1 | 2;                    // Swift, Quick, Balanced, Heavy, Crushing
  payment: 'mana' | 'charge' | 'cast';
}
```

`resolveAbility(registry, slot, build, heroStats)` compiles a build into a `ResolvedAbility`: numbers (power, cost, cooldown, cast time, charge needed, range, radius, speed, counts, combo steps) plus behaviour **knobs** merged from the form, its element(s) and the pair's fusion. It is pure and unit-tested; the combat code only reads its output.

### Forms (12)

| Slot | Form | Behaviour | Combo |
|---|---|---|---|
| Primary | **Bolt** | Projectile toward the target | size and power ×0.8, 0.8, 1.0, 1.5 |
| Primary | **Volley** | Homing darts that seek different foes | 3, 3, 5 darts |
| Primary | **Lance** | Instant line through every foe up to its range | length and power ×1, 1, 1.4 |
| Primary | **Burst** | Explosion at the target point | ×1, 1, 1.5 |
| Primary | **Strike** | Element-infused melee arc in front (range 2.4) | ×1, 1, 1.2, then a 360° slam ×1.8 |
| Defensive | **Ward** | Bubble absorbing 25% max life for 6 s; bursts with its element when it breaks or ends | — |
| Defensive | **Armor** | −35% damage taken for 8 s; melee attackers take element damage and its status | — |
| Defensive | **Surge** | 6 s: +30% attack speed, +20% move speed, and basic hits always apply the element's status | — |
| Defensive | **Blink** | Dash 5 units (toward the aim point, or away from the nearest foe), untouchable for 0.4 s, leaving an element trail that hits foes | — |
| Ultimate | **Nova** | Huge blast around the hero | — |
| Ultimate | **Barrage** | 7 impacts scattered over a target area during 1.2 s (meteors, missiles, mines) | — |
| Ultimate | **Maelstrom** | A lingering zone at the target that ticks for 6 s (poison cloud, blizzard, storm field) | — |

Offensive forms deliver damage through one shared `impact()` path, so element and fusion knobs work on every form. A defensive form's element decides its extra effect (below).

### Elements

Each element adds a status and one trait to any ability that uses it. The first element is the **damage element** (resistances, weaknesses, reactions); the second adds its status and trait.

| Element | Status | Trait on offensive forms | On defensive forms |
|---|---|---|---|
| Fire | burn | +30% area (splash) | Ward/Armor burn attackers; Surge hits burn |
| Frost | chill → freeze | slows (chill) | Ward/Armor chill attackers |
| Storm | shock | hits chain to 1 more foe | attackers are shocked |
| Earth | stagger | projectiles pierce; knockback 1 | +20% extra damage reduction |
| Shadow | hex | 8% lifesteal on ability damage | lifesteal while active |
| Nature (new) | poison (stacks to 5) | poisons | regenerates 3% max life per second while active |

**Poison** (new status): each stack deals `poisonDps` × hit per second for 4 s; stacks refresh the duration. **Root** (new status, from Overgrowth): the foe can't move for 1.5 s (0.6 s on bosses) but can still attack in reach.

New reactions (the existing five stay):
- **Combust**: Fire hits a poisoned foe → the poison detonates around it for `combustMult` × the hit, clearing the poison.
- **Blight**: Shadow hits a poisoned foe → its poison stacks spread to foes within 2.5 units.

New mastery (10 Nature attunement): **Plaguebearer**: poison stacks to 10.

### Fusions (15 pairs)

A two-element ability gets its pair's fusion on top of both elements. Each fusion is one data row of knobs.

| Pair | Fusion | Effect (knobs) |
|---|---|---|
| Fire + Frost | Steam | blinds; area ×1.2 |
| Fire + Storm | Plasma | +2 chain jumps |
| Fire + Earth | Magma | leaves burning ground for 3 s; knockback 1 |
| Fire + Shadow | Hellfire | brands: branded foes explode on death |
| Fire + Nature | Wildfire | area ×1.4, power ×1.15, **scatter** (impacts land off-target), burning ground 2 s: bigger but less controlled |
| Frost + Storm | Superconductor | +1 chain jump; chill and shock together set up Superconduct |
| Frost + Earth | Glacier | freezes outright; pierce; power ×0.9 |
| Frost + Shadow | Soulfrost | frozen foes under 25% life shatter (execute) |
| Frost + Nature | Rimebloom | leaves a chilling, poisoning thicket for 3 s; power ×0.95 |
| Storm + Earth | Magnetism | pulls foes together before the hit |
| Storm + Shadow | Void | +2 chain jumps; 5% lifesteal |
| Storm + Nature | Spore Storm | +2 chain jumps; power ×0.9 (poison rides the chains) |
| Earth + Shadow | Grave | knockback 1.5; 6% lifesteal; power ×1.1 |
| Earth + Nature | Overgrowth | roots |
| Shadow + Nature | Plague | on a kill, poison and hex spread to foes within 2.5 units |

**Knobs**: `power`, `area`, `applies` (statuses), `chain`, `pierce`, `knockback`, `lifesteal`, `zone` ({seconds, tickPower}), `pull`, `execute`, `scatter`, `spread`. Merging: multipliers multiply, `chain`/`knockback`/`lifesteal` add, booleans OR, `applies` union, `zone` keeps the longer.

### Weight

Five steps, w ∈ −2..2 (Swift, Quick, Balanced, Heavy, Crushing). From `balance.json → delve.abilities.weight`:

| | per step |
|---|---|
| power | ×(1 + 0.28w) |
| mana cost / charge needed | ×(1 + 0.30w) |
| cooldown | ×(1 + 0.25w) |
| area and projectile size | ×(1 + 0.12w) |
| projectile speed | ×(1 − 0.12w) |
| cast time | ×(1 + 0.25w) |

Light builds are cheap, fast and spammable; heavy ones hit hard, cost more and come slower.

### Payment

| Payment | Pays with | Trade |
|---|---|---|
| **Mana** (default for Primary and Defensive) | its mana cost; then its cooldown | — |
| **Charge** (default for Ultimate) | a charge meter on the button, filled by the hero's damage dealt (1 unit per weapon-damage worth) and trickling in lulls (no foe within 6 units); no mana | needs `cost × chargeRatio` units; 1 s lockout after firing |
| **Cast** | a wind-up (per slot: 0.35 / 0.5 / 1.2 s, scaled by weight) during which the hero can't move and can be hit | mana cost ×0.5, power ×1.2 |

Only one wind-up at a time; the other buttons wait until it lands.

### Numbers (`balance.json → delve.abilities`)

| Slot | Mana cost | Cooldown | Cast time |
|---|---|---|---|
| Primary | 8 | 0.45 s | 0.35 s |
| Defensive | 25 | 10 s | 0.5 s |
| Ultimate | 60 | 18 s | 1.2 s |

- **Mana pool**: 60 + 3 per point of total attunement; regen 4 + 0.2 per point per second × Mana Regen; `basicAttackGain` 5 per basic attack; mana motes add `moteAmount`.
- **Charge**: `chargeRatio` 0.35 (a Balanced Ultimate needs about 21 units), `lullCharge` 1.5 units/s.
- **Combos**: `comboWindow` 1.2 s.
- **Element power**: as today, `powerPerAttune` (+5%) per attunement point in the ability's element(s), averaged, times the gear's `<Element> Damage` affixes.

Form base values (power, range, radius, speed, counts, combo) live in `arpg.json → forms`.

## Attunement and gear

Gear still carries an element and attunement affixes, now including Nature (`natureAttune`, `naturePower`, and Nature gear rolls). Attunement no longer unlocks anything. It sizes the mana pool, powers abilities of that element, and grants masteries at 10. Monster biomes are unchanged. Nature is weak to Fire, and Fire's weakness entry stays Frost.

### Legendaries rewritten for the new system

| Legendary | New text |
|---|---|
| Pyroclasm | Fire impacts burst into 3 embers dealing {v}% damage. |
| Stormcaller | Storm abilities chain to {v} extra foes. |
| Rimeheart | Frost Novas leave a freezing field for 3 s. +{v}% Frost damage. |
| Bedrock | Earth abilities are 40% larger and stagger what they hit. +{v}% armor. |
| Nightstalker | Kills cut your Defensive's cooldown by 1 s. +{v}% Shadow damage. |
| Manaweaver | Abilities cost {v}% less mana. |

The others are unchanged.

## Aiming and input

`ArpgInput.cast` becomes `{ slot: 0 | 1 | 2; aim?: Vec } | null` (0 Primary, 1 Defensive, 2 Ultimate); `aim` is a world point. Without `aim`, an ability picks its own target:
- directional forms (Bolt, Volley, Lance, Strike): the nearest foe;
- placed forms (Burst, Barrage, Maelstrom): the densest cluster in range;
- Blink: away from the nearest foe.

An aim point beyond range is clamped to range.

- **Phone**: a quick tap casts on auto-aim. Dragging from the button shows a marker in the arena (a circle for placed forms, a line for directional ones); releasing casts there, and dragging back onto the button cancels.
- **Desktop**: a quick tap of Q/E/R (under 150 ms) auto-aims. Holding shows the marker at the mouse, and releasing casts there.

## Save (version 3)

`skillSlots` is replaced by `abilities: { primary, defensive, ultimate }` of `AbilityBuild`, and `reactionsSeen` also accepts `combust` and `blight`. `parseDelveProfile` migrates version 2 saves, keeping gear, scrap and codex and giving new default builds. The storage key stays `alloy:delve:v2`.

Defaults (new and migrated profiles), with E the equipped weapon's element (Fire if unarmed):

| Slot | Default build |
|---|---|
| Primary | Bolt, [E], Balanced, mana |
| Defensive | Ward, [Frost], Balanced, mana |
| Ultimate | Nova, [E], Balanced, charge |

`setAbility(registry, profile, slot, build)` validates the build: the form belongs to the slot, elements are 1–2 distinct values, and the weight and payment are in range.

## Clarifications (from spec review)

**Naming.** The Ultimate form is **Maelstrom** (not Tempest, which is the Storm mastery).

**Element order.** `elements[0]` is the damage element; `elements[1]` adds its status and trait. The workshop asks for a *main* element and an optional *infusion*, with a swap button. `[a, b]` and `[b, a]` are different builds with the same fusion. "An ability with Fire" (for legendaries) means Fire in either position.

**Payment and cooldowns.**

| Payment | Gate |
|---|---|
| Mana | the slot cooldown |
| Cast | the slot cooldown; the wind-up happens first |
| Charge | the full meter, plus `chargeLockout` (1 s); the 18 s Ultimate cooldown does not apply |

Nightstalker cuts the Defensive's cooldown by 1 s, or adds 1 charge unit when the Defensive pays by charge. A mana cost above the pool's size can never be paid: the workshop warns ("needs 96 mana, your pool holds 75"), and the engine fails with `noMana`.

**Casting edge cases.**
- Presses during a wind-up are dropped (the HUD shows the other buttons locked).
- An explicit aim point is fixed at the press.
- Auto-aim is resolved again when the effect lands; if nothing is left to aim at, it lands where the press aimed, so a wind-up is never wasted.
- The basic attack pauses during a wind-up.
- With auto-aim and nothing in range, directional and placed forms fail and cost nothing, as today. Nova, the defensives, and any cast with an explicit aim always fire.
- A full charge meter doesn't fire by itself; it only unlocks the button.

**Defensive forms and knobs.** A defensive's damage (Ward burst, Blink trail, Armor retaliation) goes through the same `impact()` path as everything else, so fusion knobs apply to it: Plasma's Ward burst chains, Magnetism's pulls. While any defensive is active (Blink counts as 2 s):
- **Elements:** melee attackers get the element's status (Fire burns, Frost chills, Storm shocks, Shadow hexes, Nature poisons, Earth staggers).
- **Earth:** 20% less damage taken on top.
- **Shadow:** +10% lifesteal.
- **Nature:** 3% of max life regenerates per second.
- **Damage:** Ward burst `power2` 1.2, Armor retaliation `power2` 0.6 per struck attacker, Blink trail `power2` 0.8 (all × weapon damage × the ability's power factors).

**More numbers.**

| Value | Setting |
|---|---|
| Poison | each stack deals `poisonDps` (0.12) × the hit per second for `poisonDuration` (4 s). A new stack refreshes the duration and raises the per-stack value to the stronger hit; total = per-stack × stacks. |
| Combust | `combustMult` 1.6 × the hit, radius 2 |
| Blight | radius 2.5 |
| Chains | jump up to 4 units, 70% damage per jump |
| Scatter | impacts land up to `scatter × radius × 1.5` off-target; sizes vary ±30% × scatter |
| CC immunity | stagger 1.2 s, freeze 1.5 s, root 2 s after each ends, so spam can't lock a foe |
| Bow | interval 0.75 s, range 9.5, speed 20, pierces; implicits as the staff |

Form base values are listed in `arpg.json → forms` and copied in the plan.

**Balance keys.** Pool numbers stay in `delve.mana` (`basePool` 60, `poolPerAttune` 3, `baseRegen` 4, `regenPerAttune` 0.2, `basicAttackGain` 5); `comboThreshold` is removed. `delve.abilities` holds only the slot, weight, payment and combo numbers.

**Legendary scope.**
- Pyroclasm: impacts of Bolt, Burst and Barrage; not zone ticks or chain jumps.
- Rimeheart: a Nova with Frost in either position.
- Bedrock: abilities with Earth in either position.

**State and events** (engine → client contract).
- `HeroEntity` gains:
  - `mana`, `manaMax`, `manaRegen`: numbers, replacing the per-element maps;
  - `abilities`: `ResolvedAbility[3]`;
  - per slot: `cooldowns`, `charge`, `comboStep`, `comboAt` (arrays of 3);
  - `windup: { slot, aim, start, until } | null`;
  - `defend: { form, until } | null` (the active Defensive; its elements come from `abilities[1]`);
  - `ward: { hp, max } | null`.
- Events:
  - `cast { slot, name, form, element, x, y, tx, ty }`
  - `windup { slot, until }`
  - `noMana { slot }`
  - `buff { form, element, until }`
  - `wardBreak { x, y, element }`
- `beam { x, y, tx, ty, width, element }` (Lance) and `slash { x, y, dir, range, arc, element }` (Strike).
- `Projectile.skillId` becomes `form` (a `FormId`, `'ember'` or null) plus `ability` and `homingId`; `Zone.skillId` becomes `source` (a fusion or form id) plus `ability`. The renderer and pixel floor style by `element` plus these.
- **Summons** (the Grave Golem) are removed with the old spells: the `Summon` type, `summonsTick`, golem targeting and their VFX.

**Gear changes and floors.**
- **Re-equipping** mid-fight re-resolves the abilities and the pool size, and clamps mana to the new maximum. Charge, buffs, combos and cooldowns carry over.
- **Changing abilities** is only possible at the Anvil, between dives: during a dive the workshop is read-only and `setAbility` refuses.
- **Each floor** starts with full mana and empty charge meters.

**Migration.** The default element E is the equipped weapon's element (Fire if unarmed), so `parseDelveProfile` still needs no registry.

**Power and comparisons.**
- `estimateCombat` replaces spell DPS with:
  - the Primary's sustained DPS, limited by its cooldown and by mana income (regen + basic hits);
  - plus the Ultimate's damage over its expected cycle: its cooldown for mana or cast payment, or its charge need ÷ basic-attack damage per second for charge.
- Defensives count only toward survivability: Ward adds its absorb to effective life, and Armor its reduction.
- `heroPower`, `compareItem`, `equipBest` and the camp's Power readouts keep their shapes.

**Client clean-up.** Remove the "NEW SPELL" banner and the spell-unlock toast, the camp's "N spells" strip and tutorial text, and the Spellbook. Add Nature to `MANA_HEX`, `ELEMENT_LIGHT` and the per-element renderer graphics. E2E D01 checks the three ability buttons instead of the "Fireball" label. D04 keeps its forge and codex checks. Spell-specific engine tests (`arpg-sim`, unlock tests) are rewritten against the new forms.

## Engine units

| Unit | Responsibility |
|---|---|
| `types/ability.ts` | AbilitySlot, FormId, AbilityBuild, ResolvedAbility, Knobs |
| `data/arpg.json` | `mana` (+nature), `forms`, `elementTraits`, `fusions`, reactions (+2), masteries (+1); `skills` removed |
| `arpg/abilities/resolve.ts` | `resolveAbility`, `mergeKnobs`, `fusionFor(a, b)`: pure |
| `arpg/abilities/cast.ts` | `tryCast(ctx, cast)`: cost, charge and cooldown checks, combo step, wind-up start, and `castProgress` each tick |
| `arpg/abilities/forms.ts` | one executor per form, using `impact()` / `hitArea()` / projectiles / zones |
| `arpg/abilities/impact.ts` | `impact(ctx, ability, point, opts)`: area, chain, pull, zone, scatter, execute, spread, lifesteal, embers |
| `arpg/combat.ts` | poison, root, Combust, Blight; ward/armor mitigation and retaliation in `hurtHero`; charge from damage dealt |
| `arpg/step.ts` | single mana pool, wind-up root, buff timers, homing darts, generic projectiles and zones by knobs, lull charge |
| `delve/hero-stats.ts` | `manaPool(stats)`, element power; spell-unlock helpers removed |
| `delve/profile.ts` + schema | `abilities`, `setAbility`, v2 → v3 migration |
| `arpg/bot.ts` | Primary whenever a foe is in range; Defensive under 70% life or when 3+ foes are close; Ultimate on 3+ foes or a boss |

## Client units

- **Arena HUD**: one mana bar; three ability buttons with a cooldown sweep, charge ring, combo pips and wind-up progress; drag-to-aim; a floating ability label on cast.
- **Input**: Q/E/R tap versus hold-to-aim with the mouse; phone drag gestures (in a gestures file, per the client conventions).
- **Renderer**:
  - projectiles and zones styled by element and form instead of spell id;
  - hero auras for Ward, Armor and Surge;
  - a wind-up circle, and the aim marker;
  - the pixel floor reacts by element (earth furrows, burning ground as lava, frost patches).
- **Anvil → Abilities tab** (replaces Spells), per slot:
  - form chips, and element toggles (pick up to 2; a pair shows its fusion's name and effect);
  - a 5-step weight slider and a payment choice;
  - a live read-out (damage per hit, mana or charge, cooldown, cast time) and a one-line summary built from the parts.
- **Item details**: "Unlocks / Loses spells" becomes the attunement change and its element-power effect.

## Testing

- **Engine unit tests**:
  - resolver maths: weight, payment, knob merging, fusion lookup;
  - each form's executor: hits, combo steps, aim versus auto-aim, placed forms at the aim point;
  - the charge meter (fills from damage and in lulls; fires at full);
  - cast wind-up (roots, delays, waits for other buttons);
  - Ward absorbs and bursts, Armor reduces and retaliates;
  - poison stacking, Root, Combust, Blight;
  - v2 → v3 save migration; `setAbility` validation.
- **Pacing guard rails** (`delve-pacing.test.ts`) keep their thresholds; retune ability numbers until they pass.
- **Client**: HUD and workshop component tests; the store's `setAbility`.
- **E2E** (4 devices): D01–D03 as today; D04 checks the Abilities tab builds a fusion and the HUD shows three ability buttons.

## Out of scope

- Progression gating, XP, materials and ability evolution (project 2).
- Showpiece abilities; new biomes or Nature monsters.
- Held-button beams and channels: every input is a press, and long effects come from zones and buffs.
