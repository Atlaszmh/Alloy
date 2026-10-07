# Delve boons: dive-scoped rewards at the stops

Date: 2026-10-06. Status: approved in brainstorming, awaiting spec review.

## Goal

The stop between depths offers more varied rewards. An ordinary stop now offers three **boons**: free, dive-scoped picks in the Hades mould that stack up to a per-boon cap and vanish when the dive settles. The paid power-ups (equip, slot, move, upgrade, rune) leave the ordinary stop. They stay at the anvil alcoves and at the guided start's stops.

## Decisions

| Question | Decision |
|---|---|
| What kind of reward | Dive-scoped boons, reset at the Anvil |
| Stacking | Each boon stacks up to its own `cap` (1–3), set in data |
| Place beside the power-ups | Boons replace the power-ups at ordinary stops |
| The guided start | Guided stops keep their power-up cards; the alcoves keep the paid ops everywhere |
| Offer shape | Three tiers (common, rare, epic), rolled per card, leaning rarer with depth |
| First batch | Every group: offense, element, defense, tempo, fortune, pact, floor |
| Architecture | A boon is a generalised shrine blessing (`Buff`); shrines become boon rows; `shrines.json` is deleted |

## 1. The boon row

One file, `src/data/boons.json`, validated by `BoonDefSchema` in `data/schemas.ts`, read through `registry.getBoons()` and `registry.getBoon(id)`. Types live in `src/types/boon.ts`.

```ts
interface BoonDef {
  id: BoonId;                 // string, unique
  name: string;
  family: BoonFamily;         // 'offense' | 'element' | 'defense' | 'tempo' | 'fortune' | 'pact' | 'floor'
  duration: 'dive' | 'floor'; // every stop boon is 'dive'; shrine rows may be 'floor'
  cap: 1 | 2 | 3;             // stacks a dive
  minDepth?: number;          // not offered above this depth's stops (default 1)
  shrine?: number;            // a sanctum's draw weight; absent: never a shrine
  weight: { common: number; rare: number; epic: number }; // a stop's draw weight per tier; all 0: never at a stop
  tiers: [BoonTier, BoonTier, BoonTier]; // common, rare, epic
}
interface BoonTier { text: string; effect: BoonEffect }
```

- `family` sets the card's colour and keeps an offer varied: no two cards of one family.
- A stack adds its own tier's effect. Three commons of Keen Edge give 3 × its common; one epic gives the epic.
- A boon whose worn count is at its `cap` is never offered.
- `text` is the tier's whole card line, written in data. The client never formats a boon's number.
- **Shrines become rows.** Each of today's six shrines is a row with `shrine` set to its old weight, all `weight` entries 0, and its effect in tier 1 (tiers 2 and 3 copy tier 1; a shrine always grants tier 1). Devotion keeps `duration: 'dive'`, the others `'floor'`. The six shrine rows come first in `boons.json`, in `shrines.json`'s order, and the generator's draw (`generate.ts`, `weightedPick` over the rows with `shrine > 0`, in file order) is otherwise unchanged, so every floor rolls the same shrine as before. `tutorial-floor.ts`'s `shrines[0]` becomes `getBoon('vigor')`. `shrines.json`, `ShrinesDataSchema`, `ShrineDef` and `ShrineId` are deleted; `getDelveData().shrines` goes, and its readers move to `getBoons()`: the generator, `applyShrine`, the tutorial floor, `useArenaCore.ts`'s shrine name lookup and the maps tests that read `.shrines`.

**Load checks** (`data/boons-check.ts`, `boonsProblems`, refused by `createDefaultRegistry` as `setPiecesProblems` is): ids unique; three tiers each with non-empty text; every `knobs` key a `Knobs` key; every `attune.role` `'primary'` or `'secondary'`; no stop row's three tiers identical; at least one row with a stop weight in each family; every shrine row's effect within the fields a shrine could already carry or a dive stat (no floor-shaping field on a `floor` shrine); `cap` 1–3.

## 2. The effect and where each field applies

`Buff` becomes:

```ts
interface Buff { boon: BoonId; tier: 1 | 2 | 3; effect: BoonEffect }
```

`ShrineEffect` is renamed `BoonEffect` and grows. Every field is optional. **Units** (stated in `BoonEffectSchema`'s docs): a bonus field is the added fraction (`damage: 0.25` is +25%), a drop multiplier (`flux`, `runes`, `gear`) is the raw factor (`1.3`). **Stacking:** a count or an additive bonus (charges, Find, life regen, chances, fractions of life, and the "× (1 + Σ)" fields: `dodgeWindow`, `dodgeRecharge`, `defendDuration`, `magnet`, `scrap`) sums across entries, Σ being that sum; `hazardsFriendly` takes its largest entry (its boon has cap 1, so this only matters if a second source comes); a multiplier (`damage`, `manaRegen`, `maxLife`, `tempo`, and the drop multipliers `flux`, `runes`, `gear`) multiplies per entry, as `applyBuffs` does today, so today's shrines read as before; `knobs` merge per entry through `mergeKnobs` (section 2a). Each field has exactly one handler at one site; nothing reads a boon by id but the HUD.

| Field | Meaning | Applied where |
|---|---|---|
| `damage` | damage × (1 + x) per entry | `applyBuffs` (`damageMult`) |
| `manaRegen` | mana regen × (1 + x) per entry | `applyBuffs` |
| `lifeRegen` | life a second, fraction of max | `applyBuffs` |
| `maxLife` | max life × (1 + x) per entry, x may be negative; the product floored at 0.3 | `applyBuffs` |
| `tempo` | tempo × (1 − x) per entry, the product floored at 0.5 (shorter beats, faster holds) | `applyBuffs` (`HeroStats.tempo`) |
| `lifesteal` | added to `HeroStats.lifesteal` | `applyBuffs` |
| `attune` | `{ role: 'primary' \| 'secondary', points }`, added to that element of the pair | `profileStats` (section 2a), never `applyBuffs` |
| `knobs` | a `KnobsData` partial, on ability moves and basic blows | `computeHeroStats` for the blows, `resolveAbility` for the moves (section 2a) |
| `byKind` | `{ light?, medium?, heavy?, hold? }`, extra damage by the blow's or move's kind | `impact.ts` |
| `firstMove` | extra damage on a chain's first move | `impact.ts` |
| `stepBonus` | added to `delve.chains.stepBonus` | `resolve.ts` (`ResolvedChain.stepBonus`) |
| `lowLife` | `{ below, mult }`: extra damage on foes under `below` of their life (named apart from `Knobs.execute`, the frozen shatter) | `impact.ts` |
| `nearFoes` | `{ per, cap, radius }`: extra damage per awake foe within `radius`, at most `cap` | `impact.ts` |
| `dodgeCharges` | added to `dodge.charges`, may be negative, floored at 1 | `dodge.ts` |
| `dodgeWindow` | `perfectWindow` × (1 + Σ) | `dodge.ts` |
| `dodgeRecharge` | `dodge.recharge` × (1 − Σ), floored at 0.5 × | `dodge.ts` |
| `perfectAlways` | every dodge that would be hit counts as perfect | `dodge.ts` |
| `freeCast` | `{ seconds, damage }`: the first ability cast within `seconds` of a dodge costs nothing and deals `damage` more | `cast.ts` (`HeroEntity.freeCastUntil`; the cast's hits carry `freeCastDamage`) |
| `defendDuration` | the Defensive's effect duration × (1 + Σ) | `defend.ts` |
| `barrierOnFloor` | an Obsidian barrier of this fraction of max life at floor start | `world.ts` (`beginFloor`'s hero) |
| `healOnClear` | life regained when a room clears, fraction of max | `interact.ts` (`onMonsterKilled`) |
| `lastStand` | `{ below, reduce, seconds }`: once a floor, crossing under `below` life takes `reduce` less damage for `seconds` | `combat.ts` (`HeroEntity.lastStandUsed`, `lastStandUntil`) |
| `bloodPrice` | `p`: an ability's mana cost `c` is paid in life instead, `c / manaMax × p × maxHp`; unaffordable when it would leave under 1 life; a cast chain's mana part likewise; a charge chain pays its charge as normal; mana regen and the basics' mana are 0 | `cast.ts` (`canAfford`, `pay`), `applyBuffs` (regen) |
| `find` | Find points | `world.loot.find`: a dive entry's at floor start (`world.ts` already sums `diveBuffs`' `find` there), a floor shrine's at prayer |
| `magnet` | `magnetRadius` × (1 + Σ) | `step.ts`'s magnet |
| `metalUp` | added to `drops.metalUpChance` | `DropContext` in `material-drops.ts` |
| `flux` | × the flux chance | `DropContext` |
| `runes` | × a normal or elite foe's rune chance | `rune-drops.ts` |
| `scrap` | kill scrap × (1 + Σ) | `material-drops.ts` |
| `deathLoss` | a fraction subtracted from `crafting.deathLoss` (0.4), floored at 0 | `settleDive` (reads `dive.diveBuffs`) |
| `potions` | refill (shrine only, unchanged) | `applyShrine` |
| `noPotions` | potions 0 at each floor start | `beginFloor` |
| `eliteChance` | every pack's elite chance at least this | `world.ts`'s spawn (`Math.max` beside `mods.eliteChance`; the `spawnRng` draw is made whatever the value, so no stream shifts) |
| `gear` | × an elite's gear chance | `DropContext` |
| `skip` | the next door goes this many depths further (consumed when a door is chosen, added to the door's own `DoorMods.skip`) | `chooseDoor` |
| `exitRevealed` | a floor starts with its exit's room revealed | `fog.ts` (floor start) |
| `shrinesLastDive` | a floor shrine's blessing goes on `diveBuffs` instead (a refill stays a refill) | `applyShrine` |
| `noSlow` | slow ground doesn't slow the hero | `terrain.ts` (`groundSpeed`) |
| `hazardsFriendly` | hazards recharge × (1 − x) (the largest entry) and never hurt the hero | `objects.ts` |

`HeroEntity.diveBuffs` and `floorBuffs` hold the entries; the sim sites read a combined view, `buffSum(buffs)` in `delve/boons.ts` (pure: counts and additive fields summed, multipliers multiplied, the knob partials listed; computed at floor start and whenever a buff is added, kept on `HeroEntity.boon`). `applyBuffs` is the only place `HeroStats` change, and it keeps its two passes (dive, then floor) and its per-entry products.

### 2a. Knobs and attunement

**Knobs reach ability moves and basic blows.** Boons with knobs are dive boons only (no shrine carries one), so they go in where the stats are built. `diveStats` passes the dive entries' knob partials as `HeroStatsExtra.boonKnobs: KnobsData[]` (default `[]`, so the sandbox, the DPS Lab, Power and `profileStats` see none). `computeHeroStats` does two things with them:
- It merges them into each basic blow's knobs beside the blow's socketed runes (hero-stats.ts, where a blow's `knobs` is `mergeKnobs(...socketed.knobs)`).
- It keeps them on `HeroStats.boonKnobs` for the moves. `resolveAll` in `world.ts` resolves on those stats, and `resolveAbility` appends `stats.boonKnobs` to the partials it hands `mergeKnobs`, beside the legendaries'.

`applyBuffs` passes `boonKnobs` through untouched. Each entry merges by `mergeKnobs`'s own rule: `lifesteal`, `stacksBonus`, `catalyst` and `stackTime` add; `quick.*` multiply; `echo` takes the largest of the runes' and every boon entry's. A knob a blow has no use for does nothing there: `quick.cooldown` on a blow, which has no cooldown, so Swift Hands is the abilities' alone. A blow's boon knobs are not runes: they put nothing in `HeroBlow.runes`, so the HUD's rune dots and the builder's dormant marks are unchanged.

**Attunement** goes in before stats exist, and only in the fight. A new `diveStats(registry, profile)` (`delve/pair.ts`) is `profileStats` plus the summed `attune` points of `profile.dive?.diveBuffs`, passed as `HeroStatsExtra.attunement` (each role resolved against `profile.pair`; a secondary while unbound goes to the primary; `pairExtra` gains an optional attunement argument). That is the path the Training Grounds' extra attunement takes, so blows' `attunePower`, masteries, the pool and the rune ease all see it. Only `beginFloor` and `refreshWorldHero`'s callers (`takeAlcove`, the store's refresh) switch to `diveStats`. `profileStats` is unchanged, so the forge's roll floor, `overtakeProgress`, Power and `compareItem` never see a boon. `applyBuffs` ignores `attune`.

A new boon from these fields is one data row. A boon that needs a new field adds it to `BoonEffect`, `BoonEffectSchema`, `buffSum` and its one handler.

## 3. The first batch

Numbers are the starting tune, not targets. Text is each tier's card line in the order common / rare / epic.

| Boon | Family | Cap | Common | Rare | Epic | Field | minDepth |
|---|---|---|---|---|---|---|---|
| Keen Edge | offense | 3 | +10% damage | +15% | +25% | `damage` | |
| Heavy Hand | offense | 2 | heavy and hold +20% | +30% | +45% | `byKind` | |
| Opener | offense | 2 | a chain's first move +25% | +40% | +60% | `firstMove` | |
| Closer | offense | 2 | step bonus +0.05 | +0.08 | +0.12 | `stepBonus` | |
| Executioner | offense | 1 | +40% to foes under 25% life | +60% | +60% under 35% | `lowLife` | 3 |
| Pack Breaker | offense | 2 | +5% per foe within 4, up to 4 | +8% | +12% | `nearFoes` | |
| Catalyst | element | 2 | reaction bonuses grow 25% | 40% | 60% | `knobs.catalyst` 0.25 / 0.4 / 0.6 (it scales a reaction's own bonus, as the Catalyst legendary does) | |
| Saturate | element | 1 | +1 stack a hit | +1, stacks last 20% longer | +2 | `knobs.stacksBonus`, `knobs.stackTime` | 3 |
| Lingering Mark | element | 2 | stacks last +30% | +50% | +80% | `knobs` (stack duration; new knob `stackTime`) | |
| Pure Flame | element | 3 | +4 primary attunement | +6 | +10 | `attune` primary | |
| Second Flame | element | 3 | +4 secondary attunement | +6 | +10 | `attune` secondary | 2 |
| Third Wind | defense | 1 | +1 dodge charge | +1, dodges recharge 15% faster | +1, perfect window +30% | `dodgeCharges`, `dodgeRecharge` (rare), `dodgeWindow` (epic) | |
| Perfect Form | defense | 2 | perfect window +30% | +50% | +80% | `dodgeWindow` | |
| Bulwark | defense | 2 | Defensive lasts +25% | +40% | +60% | `defendDuration` | |
| Stone Skin | defense | 2 | barrier of 8% life each floor | 12% | 18% | `barrierOnFloor` | |
| Deep Breath | defense | 2 | regain 4% life a room cleared | 6% | 10% | `healOnClear` | |
| Vampire's Tithe | defense | 2 | 1.5% lifesteal | 2.5% | 4% | `lifesteal` | |
| Last Stand | defense | 1 | under 20%: 40% less damage for 2 s, once a floor | 50%, 3 s | 60%, 4 s | `lastStand` | |
| Quickstep | tempo | 2 | beats and holds 8% faster | 12% | 18% | `tempo` | |
| Swift Hands | tempo | 2 | ability cooldowns −8% | −12% | −18% | `knobs.quick.cooldown` 0.92 / 0.88 / 0.82 (no power cut, unlike the Quick rune) | |
| Free Cast | tempo | 1 | an ability within 1.5 s of a dodge is free | same, +10% damage | same, +25% damage | `freeCast` { 1.5, 0 / 0.1 / 0.25 } | 3 |
| Echo | tempo | 1 | attacks and abilities echo at 15% at least | 25% | 40% | `knobs.echo` (the largest of it and the move's or blow's runes) | 5 |
| Overflow | tempo | 2 | +20% mana regen | +35% | +50% | `manaRegen` | |
| Magpie | fortune | 2 | +25 Find | +40 | +60 | `find` | |
| Wide Net | fortune | 1 | magnet +40% | +70% | +100% | `magnet` | |
| Prospector | fortune | 2 | +10% next-metal bars | +15% | +25% | `metalUp` | |
| Flux Nose | fortune | 2 | flux chance ×1.3 | ×1.5 | ×1.8 | `flux` | |
| Rune Sense | fortune | 2 | rune chance ×1.3 | ×1.5 | ×1.8 | `runes` | |
| Scrapper | fortune | 2 | kill scrap +20% | +35% | +50% | `scrap` | |
| Insurance | fortune | 1 | a death loses 10 points less of the banked haul | 15 points | 20 points | `deathLoss` 0.10 / 0.15 / 0.20 | |
| Glass Cannon | pact | 2 | +25% damage, −20% max life | +35%, −20% | +45%, −20% | `damage`, `maxLife` | 4 |
| Blood Price | pact | 1 | abilities cost life, no mana regen, +20% damage | +30% | +40% | `bloodPrice` 0.5, `damage` | 6 |
| Hunted | pact | 1 | every pack elite-led; gear chance ×1.5, scrap +30% | ×1.8, +40% | ×2, +60% | `eliteChance`, `gear`, `scrap` | 6 |
| No Retreat | pact | 1 | 1 dodge charge; every dodge perfect | same, +10% damage | same, +20% damage | `dodgeCharges` −1, `perfectAlways` | 4 |
| Famine | pact | 1 | no potions; +15% damage, +30 Find | +20%, +40 | +25%, +60 | `noPotions`, `damage`, `find` | 4 |
| Deeper Still | pact | 1 | the next door goes 1 depth further; Find +20 | 2 depths, +30 | 2 depths, +50 | `skip`, `find` | 4 |
| Cartographer | floor | 1 | the exit's room revealed | same, Find +10 | same, Find +20 | `exitRevealed` | |
| Sanctuary | floor | 1 | shrine blessings last the dive | same, Find +10 | same, Find +20 | `shrinesLastDive` | |
| Trailblazer | floor | 1 | slow ground doesn't slow you | same, magnet +15% | same, magnet +30% | `noSlow` | |
| Arsonist | floor | 1 | hazards recharge 50% faster and spare you | 65% | 80% | `hazardsFriendly` | |

Stop draw weights: every row `{ common: 10, rare: 6, epic: 3 }` but pacts `{ 4, 3, 2 }` and floor `{ 6, 4, 2 }`. The tier draw happens first (section 4), so these weights choose among rows within a tier.

`stackTime` is the one new knob: stack duration × (1 + Σ), read where `stackUntil` is set in `applyStacks`. It joins `Knobs`, `NEUTRAL`, `mergeKnobs` (additive) and `KnobsSchema`, and Power's `estimateCombat` ignores it (stacks' damage is a minor term there).

## 4. The stop: roll, take, stack

**Types** (`types/delve.ts`):

```ts
interface BoonOffer { id: BoonId; tier: 1 | 2 | 3 }
type DiveStop =
  | { kind: 'boons'; offers: BoonOffer[]; taken: boolean }
  | { kind: 'powerups'; offers: StopKind[]; taken: boolean; required?: boolean };
```

**The roll** (`rollStop`, `delve/stops.ts`). A guided stop rolls as today and returns `kind: 'powerups'`. An ordinary stop calls `rollBoons(registry, dive, rng)` (`delve/boons.ts`) on the dive seed's fork `stop:<depth>`:

1. For each of 3 cards: draw a tier by `delve.boons.tierWeights` for the depth's band, bumped one tier (epic stays epic) at the chance `DoorMods.boons` the door that led here carried (`DiveState.door`'s mods; 0 when absent).
2. Draw a row by its `weight[tier]` among rows with a stop weight, `minDepth` met, `cap` not reached by `dive.diveBuffs`, and a family not already on the offer. If no row is left in that tier, try the next lower tier, then higher; none at all ends the offer.
3. With no card, no stop (`null`).

`balance.json → delve.boons`:

```json
"boons": {
  "offers": 3,
  "tierWeights": [
    { "fromDepth": 1,  "weights": [80, 18, 2] },
    { "fromDepth": 10, "weights": [65, 28, 7] },
    { "fromDepth": 20, "weights": [50, 35, 15] },
    { "fromDepth": 35, "weights": [40, 38, 22] }
  ]
}
```

`DoorMods.boons` is new: Gilded Halls 0.5, Champion's Den 0.3, the rest absent. `BoonsBalanceSchema` checks the bands ascend from depth 1.

**The take** (`takeStop`). `StopAction` gains `{ kind: 'boon'; index: number }`. On a `boons` stop: the offer at `index` (refused if out of range, if the stop is taken, or on a `powerups` stop) becomes `{ boon, tier, effect: tiers[tier − 1].effect }` pushed onto `DiveState.diveBuffs`; the stop is marked taken. Free: no pooling, no lock lift, no `banked` spend, no quest or tutorial event. A power-up action on a `boons` stop is refused ("Not offered at this stop"). Skipping is choosing a door, as now.

**Wearing it.** The next `beginFloor` wears `diveBuffs` through `FloorOptions.diveBuffs`, as a dive shrine's blessing is worn today. Floor-start effects (`barrierOnFloor`, `noPotions`, `exitRevealed`) read the summed view there. `skip` is consumed by `chooseDoor`: the door goes `skip` further and the boon's entry has its `skip` zeroed (the entry stays, so its count and Find stay).

**Stacking.** `diveBuffs` is the record: a boon's worn count is its entries. `buffSum` combines them by section 2's stacking rule.

**The alcoves** keep power-ups: `alcoveOffers` and `takeAlcove` use `stopKinds` and `runStop` unchanged.

**Settle.** `settleDive` reads `deathLoss` from `dive.diveBuffs` and leaves them, so `DiveSummary` can list them; a new dive starts with none (`startDive` builds a fresh `DiveState`), so boons never outlive their dive.

**Save.** `BuffSchema` becomes `{ boon, tier, effect }`; `DiveStopSchema` the union. The save version goes to 13; older saves reset, as every version change does.

## 5. The bot

`takeBestStop` on a `boons` stop takes the offer with the highest tier, ties broken by family in the order offense, defense, element, tempo, fortune, floor, and never a pact. On a `powerups` stop it runs the old ladder. `takeBestAlcove` is unchanged.

`economySim`'s `EconomyRow` gains `boons: Record<BoonFamily, number>` (taken that dive). `stops` stays, now the alcoves' and guided stops' spend only. The Economy view gets a "boons by family" chart series and table column.

## 6. The client

**The stop's step 1.** A `boons` stop shows `BoonCards` (`features/delve/stop/BoonCards.tsx`, `stop-boon`): three cards in the kit's plate, each with its family's colour on its edge, its tier mark (I / II / III in the rarity colours common, rare, epic), the name, the tier's line and, when worn, "Taken n of cap". The first card is `data-pad-first`; A, Enter or a click takes it; X or S skips to the road; Menu opens the pause. A `powerups` stop shows `StopPanel` as today (`stop-powerup`). The onboarding line on a boons stop reads "Take a boon"; its seen key stays the stop's.

Family colours (ENDESGA 32, in `stop/boon-style.ts`): offense red, element violet, defense steel blue, tempo amber, fortune gold, pact crimson, floor green.

**The HUD.** `HudBuff`'s `'shrine'` kind becomes `{ id: 'boon'; boon; name; family; count; dive; lines }`: one tile per distinct boon worn (a shrine is one too), its border gold for the dive and cyan for the floor, its family glyph, the count in its corner when above 1 (16 design px), and a tooltip listing its taken tiers' lines on hover or focus. `BuffRow` draws it; the timed buffs (riposte, quick, barrier) are unchanged.

**The pause** state (`pause-state`) and **`DiveSummary`** list the dive's boons by name and count (`dive-boons`).

**Help.** The dive topic gains one line: "Each stop offers three boons. Take one: it lasts the dive, and some stack."

**The kit gallery** shows a `BoonCard` at each tier.

## 7. Tests

**Engine, unit:**
- `delve-boons-data.test.ts`: `boonsProblems` is empty on the shipped data and catches a bad knob key, a bad element role, a cap of 4, a family with no stop row, and a stop row whose three tiers are identical.
- `delve-boons.test.ts`: `rollBoons` offers 3 distinct families, is deterministic per seed, never offers a capped boon, honours `minDepth`, falls back a tier when a tier is empty, bumps a tier under a door's `boons`; `buffSum` adds across entries and tiers.
- `delve-stops.test.ts` (extend): `takeStop` with `boon` pushes the entry, spends nothing, marks taken, refuses a second take and a power-up action; a guided stop still offers power-ups and takes them; `alcoveOffers` and `takeAlcove` unchanged.
- One short test per field at its site, in the file that owns the site's tests: `applyBuffs` (damage per entry, maxLife floor, tempo floor, lifesteal, bloodPrice's regen, `boonKnobs`), `profileStats` (attune by role reaches a blow's `attunePower`), resolve (two Swift Hands entries multiply; Echo takes the larger of a rune and a boon; a blow merges its runes' and the boons' knobs; a blow's `runes` list stays its sockets'; `profileStats` and the sandbox carry no boon knob), dodge (charges, window, perfectAlways), impact (byKind, firstMove, lowLife, nearFoes), cast (free cast and its damage, the life cost and its refusal), defend (duration), combat (last stand once a floor), interact (heal on clear, `shrinesLastDive`), drops (metalUp, flux, runes, scrap, gear), spawn (eliteChance), `settleDive` (deathLoss; buffs left on the settled dive), `chooseDoor` (skip consumed), fog (exitRevealed), terrain (noSlow), objects (hazardsFriendly), stacks (`stackTime`).
- Shrines: over 20 seeds and six depths, every generated floor's sanctum holds the same shrine id as before the change (pinned from the current code), and the tutorial floor's shrine is still Vigor.
- Profile schema: a v12 save resets; v13 round-trips a dive with boons and a `boons` stop.

**Performance:** see section 8.

**Engine, pacing** (at the close, over 16 seeds, read before tuning): `delve-pacing.test.ts`, `delve-pacing-robust.test.ts`, `delve-pacing-pairs.test.ts`, `delve-tutorial-bot.test.ts`, `delve-maps-sweep.test.ts`. If a rail moves, tune the boon tiers' numbers first, then `tierWeights`, then the alcoves' `kindWeights`. Never the rails. Record the measured numbers in CLAUDE.md as the other systems do.

**Client:**
- `BoonCards.test.tsx`: three cards show tier, line and the taken count; A takes; X skips.
- `BuffRow.test.tsx` (extend): a boon tile with its count and tooltip; a shrine as a boon tile.
- `arena-hud-snapshot.test.ts`: the snapshot carries boons.

**E2E:**
- `delve-pad-nav.spec.ts` PN06: the boon step's cards each reachable, X to the road.
- A stop spec: take a boon, see its tile on the next floor.
- `e2e/fixtures/delve.ts`'s `toRoad` skips either kind of step.
- `delve-type.spec.ts` TY02: the tile's count at the floor.
- `delve-tutorial.spec.ts` unchanged: the guided stops keep their cards.

## 8. Performance

Boons add hits: Echo doubles the blows and moves it rides, Pack Breaker and Hunted bring bigger fights, and a boon's knobs stack on a build's runes (Echo with Split and Multi-shot on a Volley). This section measures where that costs and fixes what the measurement shows.

**Measured** (2026-10-07, a throwaway harness: the bot on generated floors at depths 8 and 20, 6 seeds each, 90 s a floor, an unkillable starter hero, Echo 0.4 forced on every blow and move against none):

| Depth | Echo | Sim µs a step | Worst step | Hits | Events |
|---|---|---|---|---|---|
| 8 | none | 93.7 | 2.0 ms | 2368 | 4510 |
| 8 | 0.4 | 93.5 | 2.0 ms | 2767 | 5294 |
| 20 | none | 96.0 | 3.9 ms | 2953 | 4393 |
| 20 | 0.4 | 92.4 | 3.8 ms | 4137 | 6203 |

The sim isn't the cost: a step is under 0.1 ms of its 33 ms tick, with or without Echo. What grows is the events, by up to 41%, and every event lands on the client. The client already caps most of what an event makes: mana particles (500), the pixel floor's particles (7000) and stamps (8), floating numbers (45, pooled), infusion draws (600 a frame), and each sound's own throttle. Two things are uncapped and fire per hit:

1. **Hit-stop and camera kick.** `hitstopMs` freezes the display on every heavy hit, and an echo of a heavy blow freezes it again 0.4 s later. That stutters as well as costs: a heavy echo reads as a second, weaker hit, not a second impact.
2. **The hit's pixel-floor and mana-fx moments.** These are capped in total but not per frame, so a burst of echoes can spend the whole budget in one frame and starve the next real hit's effect.

**The changes:**
- The engine's `hit` event gains `echo?: true`, set where a hit comes from an echo (`landBlow`'s `echo` option, an ability's `replay`). Its numbers and its gameplay don't change.
- On the client, an echo hit never starts hit-stop or a camera kick (`fx/hitstop.ts`, the shake), and plays its hit sound at half volume through the same throttle.
- The mana-fx and pixel-floor hit moments take a per-frame budget, `HIT_FX_BUDGET` (`fx/mana-fx.ts`, alongside `INFUSION_BUDGET`). Real hits draw first and echo hits only from what is left; a hit over the budget draws its floating number and nothing else. The starting number is 24 hit moments a frame, tuned by the check below.

**The check:**
- **Engine:** `tests/delve-sim-perf.test.ts`, skipped unless `SIM_PERF` is set, as the two-build gate is. It runs the harness above on the worst case boons make: a build with Echo III, Split III and Multi-shot III on its Primary and blows, against a Hunted floor at depth 20. It prints µs a step and events a second. It asserts only that the worst step stays under 8 ms (a quarter of a tick); wall-clock means aren't asserted.
- **Client:** a dev-only frame readout in the Training Grounds bar (`FrameChip`, dev builds only, beside the DPS Lab button): the 95th-percentile frame time over the last 5 s. The Training Grounds can stand the worst case today, with any rune at any tier and a pack of foes.
- **The plan's last task is a manual check:** that build against 12 foes at 1920×1080, Effects at 100%, with and without the budget. The numbers go into this section and into CLAUDE.md. The target is a 95th-percentile frame at or under 16.7 ms on the dev machine. If it misses, profile before tuning: lower `HIT_FX_BUDGET` first, then the per-sound throttles. Never cut gameplay hits.

## Out of scope

- Boons from shrines beyond today's six (a shrine is a row; more can come as data later).
- A boon that adds a room or changes a floor's layout: it would shift the layout stream.
- A boon index in the Codex.
- Boon synergies or "duo" boons.
- Boons in the Training Grounds.
- The bot valuing boons by Power.

## Version

A feature: the client goes to the next minor, save version 13.
