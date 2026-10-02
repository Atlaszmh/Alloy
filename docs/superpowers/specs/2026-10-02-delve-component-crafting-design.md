# Delve component crafting and the materials economy (stage 4c)

**Status:** design approved in conversation, 2026-10-02; revised after the spec review the same day. Builds on v0.57.1 (runes and rune costs, weapon movesets, the Delve UI v1). Ships as **v0.58.0** with **save v8** (old saves reset; no migration).

## Why

Today almost all loot is finished gear: about 6 items a floor at depth 1 and 12 at depth 20. Most of it is salvaged on sight. The user wants:
- gear to be rare, and **currency and crafting materials** to be the main loot;
- the gear you wear to be **forged at the Anvil from parts**, with build intent and a chase for the perfect item;
- every drop to stay useful: low-grade materials **refine upward**;
- the element attunement you build around to also **improve your crafting**;
- everything **easily tunable** for balancing.

Gear is currently the input to every sink: salvage is the only source of Mana Dust and Links, and fusion feeds on spare items. Making gear rare means the new materials must take over those jobs.

## Decisions (the user's)

| # | Question | Decision |
|---|---|---|
| 1 | How do players get the gear they wear? | **Forged from parts** at the Anvil. Drops are mostly materials; gear drops are events. |
| 2 | How are a forged item's lines decided? | **Chosen shards set lines** (value rolled within the shard tier's range); **lines left empty roll at random**. Rerolls are the resource sink for getting an item "just right". |
| 3 | What sets rarity? | The **ingot**: its grade is the rarity. |
| 4 | Bases? | **Learned patterns**: start with a few; salvaging an item of a new base (or a pattern drop) teaches it permanently. |
| 5 | Item level? | The **metal** of the ingot, plus **ways to improve lower qualities to higher** so all drops stay useful. |
| 6 | Where do affix shards come from? | **All four:** floor drops, salvage, a shard bench (bought), and biome/door leanings. |
| 7 | Legendaries? | **Essences**: one per legendary power; forging on a legendary ingot needs one. Salvaging a legendary extracts its essence. |
| 8 | How often does whole gear drop? | **Elites and bosses only.** Normal foes drop materials and currency. |
| 9 | Pickup? | **Burst + magnet** for materials; gear and essences stay walk-over with plaques. |
| 10 | Death? | Lose the **current floor's haul plus a share of the dive's banked materials**; never the stockpile at the Anvil. |
| 11 | Attunement | **Higher attunement in an element raises roll quality** for forging, honing and rerolling items of that element. |
| 12 | Saves | **No migration.** Bump to save v8; old saves reset. |
| 13 | Tuning | **Every number is data** (JSON, Zod-validated), plus a dev **Economy view** to measure tuning. |

### Decided in the spec (the user can override)

| # | Question | Decision |
|---|---|---|
| S1 | What rides in the floor's haul? | Every material and currency pickup (bars, flux, shards, essences, scrap, Mana Dust, Links, runes, patterns). **Gear banks into the bag at once**, as today, and is never lost. |
| S2 | Abandon | **Counts as a death** for materials (floor haul + the death share). Its button reads "Abandon · counts as a death". "Anvil · back to this stop" still settles nothing. |
| S3 | Death-loss rounding | **Stochastic rounding** per entry (each metal, flux grade, affix × tier, essence, rune id × tier, scrap, Dust, Links) on a forked stream, so small stacks are still at risk. |
| S4 | Which rolls get the attunement floor | **Affix lines** (shard and random) and the **legendary power's roll**. Implicits don't. |
| S5 | Legendary odds on gear drops | Elite and boss gear still roll rarity (legendary possible). **`pity` is removed.** Lucky Charm's `legendaryBoost` now multiplies the **essence** chance. |
| S6 | Essence ids | **The legendary's id** (no separate mapping). |
| S7 | Weapon extras on a forged weapon | Fixed per rarity, placed deterministically: extra slots to the Primary first, then Basic, Ultimate, Defensive (carried skills only); sockets on the Primary's first moves first. |
| S8 | A new save | Starts with patterns for the starter sword and chest plus one more weapon (dagger), **5 Rusty bars and 1 uncommon flux**, so the first forge is possible before any dive. |

## The materials

Everything refines upward; nothing is dead loot. All materials live in a **materials pouch** on the profile (no bag space), beside the rune pouch.

| Material | Kinds | What it does | Refines |
|---|---|---|---|
| **Metal bars** | 7: Rusty, Iron, Steel, Mithril, Adamant, Starforged, Voidforged | Sets a forged item's **item-level band** | `refine.metal.count` (3) → 1 of the next metal, + `refine.metal.scrap` |
| **Flux** | 4 grades: uncommon, magic, rare, epic | Bar + flux = an **ingot of that rarity** at forge time; no flux = common | `refine.flux.count` (3) → 1 of the next grade, + `refine.flux.scrap` |
| **Affix shards** | One per affix stat (29 today, keyed by `HeroStatKey`), tiers I–V | Guarantees a line on a forged item; its value rolls within the tier's band | `refine.shard.count` (3) → 1 of the next tier, + `refine.shard.scrap[tier]` |
| **Essences** | One per legendary (12), keyed by legendary id | Epic flux + an essence = a **legendary** ingot carrying that power | — |
| **Patterns** | One per base (13) | Learned, not held: `profile.patterns` | — |
| **Currencies** | Scrap, Mana Dust, Links | All now **floor drops** too | — |
| **Runes** | Unchanged | — | Unchanged |

Refining the top grade (Voidforged, epic flux, tier V) is refused.

**Metals** (`crafting.json → metals`) replace `delve.json → materials`: `{ id, name, band: [lo, hi | null] }`. The bands must **partition** item levels from 1 upward (contiguous, no overlap, the last open-ended; a schema check). `materialName` (`loot/item-generator.ts`) reads the metal whose band contains an item's ilvl, so a forged item's name always matches its metal. Starting bands follow today's `minIlvl` thresholds: Rusty 1–4, Iron 5–9, Steel 10–15, Mithril 16–23, Adamant 24–33, Starforged 34–47, Voidforged 48+.

## Forging an item (the Forge bench)

`forgeItem(registry, profile, req: ForgeRequest)` with `ForgeRequest { baseId, metal, flux?, essence?, element, shards: ShardRef[] }`. The player chooses, in order:
1. **Pattern:** any learned base.
2. **Metal bar:** sets the item level, `ilvl = clamp(profile.bestDepth, lo, hi)` (a new save's `bestDepth` 0 gives `lo`; an open band clamps only below).
3. **Flux:** none → common; a grade → that rarity; **legendary = epic flux + an essence**. The base's slot must be one the legendary allows (`legendaries[].slots`), else the forge refuses; the pattern list marks which patterns an essence fits.
4. **Element:** either element of the hero's pair is free; any other costs `crafting.offPairDust`. With no secondary bound, the primary is free.
5. **Shards:** up to the rarity's line count (`loot.affixCount`, today 0/1/2/3/4/4). Each must be an affix allowed on the base's slot (`affixes[].slots`) and distinct. **Lines left empty roll at random** from today's weighted pool (excluding the shards' affixes).
6. **Price:** `crafting.forgeScrap[rarity] × scrapLevelFactor(ilvl)` scrap, plus the consumed bar, flux, essence and shards.

**Refusals:** mid-dive (the dive lock), an unknown pattern, missing materials or scrap, a shard affix not allowed on the slot, duplicate shard affixes, more shards than lines, an essence whose legendary doesn't fit the slot, and **a full bag** (`loot.bagSize`). Each refusal has a reason string, as the other profile ops do.

**The roll formula (decision 11, S4).** `StatRoll.roll` keeps today's meaning: the line's position in the affix's full ilvl-scaled range, from 0 to 1. Each affix line has a **band** `[bmin, bmax]`: a shard line's is `crafting.shardTiers[tier]`; a random line's is `[minRoll[rarity], 1]`, as today. For an item whose element is in the hero's pair, the **attunement floor** is

```
floor = min(attuneRoll.cap, attuneRoll.perPoint × A)
```

where `A` is the hero's current attunement points in that element (`profileStats(registry, profile).attunement[element]`, integer points from gear and `*Attune` lines). For an off-pair item, `floor = 0`. A roll then draws `r ∈ [0, 1)` and sets

```
u = floor + (1 − floor) × r
roll = bmin + (bmax − bmin) × u
```

so the floor lifts the whole distribution within the band rather than piling onto its bottom. The same formula applies to the **legendary power's roll** (its band `[0, 1]`). Implicits are unchanged. `StatRoll` gains `band?: [number, number]` (absent = the rarity default); `GearItem` gains `hones: number`.

**Attune affixes.** `*Attune` lines are small integers (1–2), so five tiers would collapse. `crafting.json → affixShardTiers` may give an affix its own tier bands (e.g. Attune shards: tiers I–II only, `[0,0.5]` and `[0.5,1]`); the shard pouch and the bench honour each affix's tier count.

**Weapons (S7)** come out with their rarity's carried skills (`movesets.carries`) and `crafting.weaponExtras[rarity] = { slots, sockets }` (starting values: the low end of today's `movesets.extraSlots` and `runes.socketDrops`), placed deterministically by S7. Links still buy more; Transfer still moves a moveset onto the new weapon.

**Preview.** `previewForge(registry, profile, req)` returns everything `forgeItem` would produce except the RNG draws: each line's band and affix (or "random"), the attunement floor, the implicits at the ilvl, the price, the refusal reason if any, and for weapons the carried skills, slots and sockets. The bench renders only this.

**Bookkeeping.** Forging uses the stream `forge:${forgeCount}` and bumps `forgeCount`; the item's uid is `g${nextUid}` (bumps `nextUid`). A forged item goes through `recordFinds` (Codex, `stats.itemsFound`), and a forged legendary plays the `LegendaryFanfare`.

## The "just right" sinks (the Temper bench)

On any owned item, between dives (each refused mid-dive, each bumps `forgeCount` and draws from `forge:${forgeCount}`):

| Operation | Effect | Price |
|---|---|---|
| **Hone** *(new)* | Reroll one affix line's value within its band (shard band or rarity default), attunement floor applied. | `crafting.honeScrap × rarityCostMult[rarity] × honeGrowth^hones × scrapLevelFactor(ilvl)`; `hones` +1 |
| **Reforge** *(exists)* | Replace one line with a random different affix; **clears its `band`** (back to the rarity default). | As today |
| **Imprint** *(new)* | Replace any line with a chosen shard: its affix, rolled in the shard's band. Refused for an affix already on the item or not allowed on its slot. | The shard + `crafting.imprintScrap[rarity] × scrapLevelFactor(ilvl)` |
| **Upgrade** *(exists)* | +1…+10, each +10% to all stats. | As today |
| **Re-attune** *(exists)* | Change element within the pair. | As today |

**Alloy Fusion is removed:** `fuseItems`, `fuseGear`, `checkFusion`, `forge.fuseCost`, the Fuse bench, the store action and their tests. Refining flux replaces "three items into a better one".

## Salvage (what gear gives back)

`salvageYield(registry, profile, item)` previews the possibilities; `applySalvage(registry, profile, item, rng)` applies one item's yield. Every salvage path goes through `applySalvage`: the Loadout's Salvage, Salvage junk, and **auto-salvage** of new gear (`addLootToBag`). Salvage draws from `salvage:${forgeCount}` and bumps `forgeCount` (mid-dive auto-salvage draws from the dive's `materialRng`). It returns:
- **Scrap**, as today (`forge.salvage`).
- **Shards:** one shard of one of its affix lines (picked at random), at the tier `crafting.salvageShardTier` gives that line's `roll` (thresholds → tier), plus a `crafting.salvageExtraShard` chance of a second from another line. A common item (no lines) gives none.
- **Its pattern**, if not yet learned.
- **Its essence**, if legendary (instead of a shard). This covers a legendary auto-salvaged by a full bag mid-dive: the essence goes to the floor's haul.
- **Links** from a weapon's extra slots and sockets, and its runes by the parts rule, as today.
- **Mana Dust** for an off-pair item, as today.

Mid-dive, salvage yields go to the floor's haul; at the Anvil, straight to the pouch. `salvageCandidates` keeps its rules.

## Drops and the economy

**Streams.** Material drops roll on a new `world.materialRng = rng.fork('materials:…')` (`arpg/world.ts`, beside `lootRng` and `runeRng`), so gear, rune, orb and mote rolls are untouched by material drops. Material drops never happen in the sandbox (inside `killMonster`'s `!world.sandbox` guard).

**Drop tables** (`balance.json → delve.drops`). Per foe kind (`normal`, `elite`, `boss`), each material entry is `{ chance, count: [lo, hi] }` (the chance to drop at all, then a uniform count), scaled by the door's multipliers:
- **Normal:** `scrap`, `bars`, `dust`, `shards` (with `tiers` weights), `links` (rare). **No gear.**
- **Elite:** the same entries with higher chances, plus `flux` (with `grades` weights), `gearChance` and `patternChance` (an unknown pattern).
- **Boss:** `gear` (one item, rolled as today's boss item: `bossMinRarity` applies to every boss), `flux`, `shards`, `essenceChance` (× Lucky Charm's `legendaryBoost`), `patternChance`.
- **First boss:** guarantees one essence (a legendary the hero can use) plus one epic flux. `firstBossLegendaryGiven` becomes `firstEssenceGiven`, set when that floor's haul banks (so a death before banking grants it again).
- **Scrap pickups** carry today's kill scrap: `scrapLevelFactor(ilvl) × drops.scrapByKind[kind] × (1 + scrapFind%)` (`KILL_SCRAP_MULT` moves into data). Scrap is no longer credited to the purse on kill.
- **Runes:** unchanged rates; a rune drop now rides the haul like other pickups.

**Metal by depth:** a dropped bar is the metal whose band contains the floor's ilvl, with `drops.metalUpChance` of the next metal.

**Find** (today's magic find, the `magicFind` stat, relabelled "Find"): no longer touches gear rarity. With `F` = total Find % (gear + door), each flux or shard drop bumps its grade or tier by one with chance `min(drops.find.cap, F / 100 × drops.find.perPoint)`. The `luck` terms for gear (depth, elite, boss) stay for elite and boss gear rarity; `magicFind` no longer feeds them.

**Biome leanings.** `crafting.json → families` maps every affix to a family (offense, defense, sustain, utility, element). Shard affix weights = the affix's base weight × `drops.biomeShardWeights[biome][family]`, and the biome element's `*Power` / `*Attune` shards × `drops.biomeElementWeight`.

**Doors.** `DoorMods` loses `magicFind` and `dropMult` and gains `{ materials, runes, gear, flux, essence, shardTier, find }` (multipliers, plus `find` added to Find): gilded `flux` and `essence` up, `find` +; cursed `shardTier` up; swarm `materials` 1.3 and packs ×1.5 (as today); champions elites up (so gear); **Quiet Shrine** `materials` 0.5 and `runes` 0.5 ("half the loot"). Every place that reads the old fields changes: `types/delve.ts` `DoorMods`, `data/schemas.ts`, `delve/profile-schema.ts` (the dive's stored door), `loot/drops.ts`, `arpg/rune-drops.ts`, `arpg/sandbox.ts`'s `LootContext`, the door `text` strings in `delve.json`, and `client/.../stop/DoorPane.tsx`'s treasure icon (from `gear` or `essence` > 1).

**The shard bench** (Anvil, Materials pane): `buyShard(registry, profile, affix)` sells a **tier I** shard for `crafting.shardBench { scrap, dust }`; higher tiers come from refining.

**Gear drops** still go to the bag (cap 40, auto-salvage through `applySalvage`).

**Pacing targets** (the balance phase tunes to these, measured by the pacing rails and the Economy view):
- after **dive 1**: enough to forge a magic item;
- by about **dive 5**: a first epic;
- the **first boss**: a first legendary, forged;
- over **12 dives**: depth progression at least matches today's rails (`tests/delve-pacing.test.ts`).

## Banking and death (decision 10, S1–S3)

| Pickup | During a floor | At floor clear | On death or abandon | On extract |
|---|---|---|---|---|
| Gear | **Bag at once** (`bankWorld`, as today) | — | Kept | Kept |
| Materials, scrap pickups, Dust, Links, runes, essences, patterns | **`DiveState.haul`** | Haul → `DiveState.banked` | Haul lost; `banked` loses `deathLoss` (stochastic per entry) | `banked` → profile |
| Scrap bounty | `dive.bounty` | Grows as today | Lost | Banked |

- `bankWorld` keeps banking gear mid-floor and moves every other pickup into `haul`.
- `completeFloor` moves `haul` into `banked`.
- `beginFloor` clears `haul`, so replaying a floor's seed can't double-collect.
- **One settle.** `settleDive(registry, profile, outcome: 'extract' | 'death' | 'abandon')` is the only path from `banked` to the profile, called exactly once:
  - `extractDive` calls it with `'extract'`.
  - `failFloor` and `closeDive` call it on a death or abandon. `closeDive` gains the registry.
  - It applies `deathLoss` with stochastic rounding (`stochasticRound`, `loot/drops.ts`) on `death:${diveSeed}`.
- **Anvil · back to this stop** doesn't settle.
- The stop's line reads "Banked this dive · dying loses 40% of it" (from `deathLoss`), replacing "Already banked: yours even if you abandon".

## Arena and pickups

- **Extend what exists.** Material pickups are new `DropKind`s beside `'item' | 'rune' | 'scrap'` (`types/arpg.ts`); the existing `pickup` event gains `{ kind, id, amount }` for materials.
- **Burst and magnet** use the existing magnet: `hero.magnetRadius` (3.5) and `dropsTick`'s pull (`arpg/step.ts`).
  - Materials always magnet in.
  - Gear and essences stay walk-over with plaques; essences get a legendary-orange plaque.
- **Tunables:** the hard-coded pull speeds (10 and 18) and `ITEM_PICKUP_DELAY` move into `balance.json → delve.drops` (`magnetSpeed`, `vacuumSpeed`, `pickupDelay`).
- **Look:** small pixel pickups coloured by kind (metal by metal, flux by grade, shards by family colour, Dust cyan, Links teal, scrap gold).

## The client

**Arena HUD:**
- **Purse bar:** scrap, Links and Mana Dust, plus a **materials** total, each with this dive's gain (haul + banked). A tooltip lists the materials.
- **Found log:** groups materials ("Iron bar ×3") above gear and essences.

**Stop:**
- "Found this floor" groups materials.
- The risk line (above) replaces the old banked line.
- The `equip` power-up stays (offered only with a bag item).

**Dive summary:** materials gained, and lost on death or abandon.

**Forge tab (three panes per bench; the bench is a `level="sub"` tab, Forge | Temper):**
- **Forge bench:**
  - Left: the pattern list (learned, with unknown greyed and their sources).
  - Centre: the forge, with metal and flux pickers and counts, the element, the shard slots with a picker filtered to the slot, the live `previewForge`, the price and **Forge** (Enter / A).
  - Right: the Materials pane.
- **Temper bench:**
  - Left: the gear list (today's `GearList`).
  - Centre: Hone, Reforge, Imprint, Upgrade and Re-attune on the selected item.
  - Right: the Materials pane.
- **Materials pane:**
  - Bars, flux, shards (by family and tier), essences and runes, each row with **Refine 3→1**.
  - The **shard bench** (buy tier I).
- The Fuse bench is removed.

**Codex:** gains **Patterns** (learned / unknown, with where they come from) and **Essences** (seen / unknown, from a new `profile.essencesSeen`).

**Loadout:** the compare pane's Salvage shows `salvageYield`.

**Pause:** read-only as today; the Forge tab stays locked mid-dive.

**Loading an old save:** `parseDelveProfile` returns `{ reset: true }` for any version other than 8; the store starts a fresh v8 profile and queues a toast ("The forge changed: your save was reset").

## Tuning: every number in data

- **`src/data/crafting.json`** (new, `CraftingDataSchema`, `registry.getCraftingData()`):
  - `metals[]`: `{ id, name, band }`, partitioning ilvls; `delve.json → materials` is deleted;
  - `flux[]`: `{ grade }`, uncommon to epic;
  - `shardTiers[]`: `{ tier, min, max }`, the default roll bands;
  - `affixShardTiers`: per-affix overrides;
  - `families`: affix → family;
  - `startingPatterns[]`;
  - `startingMaterials`.
- **`balance.json → delve.crafting`** (`CraftingBalanceSchema`):
  - forging: `forgeScrap` by rarity, `offPairDust`, `weaponExtras` by rarity;
  - Temper: `honeScrap`, `honeGrowth`, `imprintScrap` by rarity;
  - refining: `refine { metal, flux: { count, scrap }, shard: { count, scrap[] } }`;
  - rolls: `attuneRoll { perPoint, cap }`;
  - salvage: `salvageShardTier`, `salvageExtraShard`;
  - `shardBench { scrap, dust }`;
  - `deathLoss`.
- **`balance.json → delve.drops`** (`DropsBalanceSchema`):
  - per kind: `normal`, `elite`, `boss` (as above);
  - `scrapByKind`, `metalUpChance`, `find { perPoint, cap }`;
  - leanings: `biomeShardWeights`, `biomeElementWeight`, `doors`;
  - pickup feel: `magnetSpeed`, `vacuumSpeed`, `pickupDelay`.
- **Removed:**
  - `forge.fuseCost`;
  - `loot.pityPerDrop` and `profile.pity`;
  - `loot.dropChance`, `extraDropChance`, `eliteDrops`, `bossDrops` (replaced by `delve.drops`);
  - `KILL_SCRAP_MULT`.
- **Economy view** (dev only, a view in the DPS Lab): runs `economySim(registry, seed, dives)` (the autopilot over N dives) for chosen seeds and charts, per dive:
  - income and spending per material;
  - items forged by rarity;
  - the deepest depth;
  - deaths.

  The pacing tests call the same `economySim`.

## Engine shape (for the plans)

**Types** (`src/types/crafting.ts`):
- `MetalId`, `FluxGrade`;
- `ShardRef { stat: HeroStatKey; tier: number }`;
- `MaterialsPouch { metals: Record<MetalId, number>; flux: Record<FluxGrade, number>; shards: Partial<Record<HeroStatKey, number[]>>; essences: Record<string, number> }`;
- `Haul` (a `MaterialsPouch` plus `scrap`, `dust`, `links`, `runes`, `patterns`);
- `ForgeRequest`, `ForgePreview`, `SalvageYield`, `SettleOutcome`.

**Profile v8:**
- **Fields:** `materials`, `patterns: string[]`, `essencesSeen: string[]`, `firstEssenceGiven`, and today's `scrap`, `manaDust`, `links`, `runes`.
- **Removed:** `pity` and `firstBossLegendaryGiven`.
- **`DiveState` gains** `haul` and `banked`.
- **Deleted:**
  - the v2–v7 schemas and migrations in `delve/profile-schema.ts`;
  - `fromV3`, `fromV5` and `fitMovesets`' migration-only paths;
  - `ParsedDelveProfile`'s `dropped`, `runesLost` and `movesetReset`;
  - the store's `movesetNotices`, `fixNotices` and `gainedPair` / `BIND_HINT` migration notices.

**Modules:**
- `src/loot/materials.ts`: pouch ops, refine, drop-table rolls.
- `src/loot/forge.ts`: `previewForge`, `forgeItem`, `honeLine`, `imprintLine`, the band and floor math.
- `src/loot/salvage-yield.ts`: `salvageYield`, `applySalvage`.
- `src/delve/crafting.ts`: the profile ops with the dive lock (`forge`, `hone`, `imprint`, `refine`, `buyShard`).
- `src/arpg/material-drops.ts`: kill → material pickups.
- `src/delve/dive.ts`: haul, banking, `settleDive`.

**Autopilot:**
- **Forging:** it forges its gear. Each dive it forges the best affordable item per slot (shards toward its stat priorities), hones while scrap allows, refines surplus, salvages gear drops it doesn't wear, and still spends Links on slots and sockets.
- **Elements:** it binds a secondary after dive 1 (`AutopilotOptions.secondary` when forced; else the first non-primary element of a biome it fought).
- **Element split:** it forges the weapon and two armour slots in the primary and the rest in the secondary, so the pair's attunement grows and the "every run finds its pair's reaction" rail holds.

**Sandbox:** `arpg/sandbox.ts` builds its `LootContext` with the new shape, and no material drops (the sandbox guard).

## Phases and parallel areas

| Phase | Areas | Owns | Gate |
|---|---|---|---|
| **A · Contract** (the integrator, first) | One area | Types; `crafting.json` and the two balance blocks with schemas and starting numbers; registry getters; profile v8 and the reset; **every new engine export as a typed stub** in `index.ts`; **every new store action** in `delveStore.ts` as a thin wrapper over the engine op; `hub/types.ts` (`bench: 'forge' \| 'temper'`, Codex sections `patterns` and `essences`); deleting Fusion (engine, store, Fuse UI) and the migrations; door shape changes everywhere they're read | Engine and client build; the suites pass with removed features' tests deleted; old saves reset with the toast |
| **B · Engine** (B1 and B2 in parallel, then B3) | **B1** drops and banking | `arpg/material-drops.ts`, `arpg/step.ts` (magnet), `arpg/world.ts` (`materialRng`), `arpg/combat.ts` (kill hook), `loot/drops.ts`, `arpg/rune-drops.ts`, `delve/dive.ts` (haul, banking, `settleDive`) | Engine suite green; determinism |
| | **B2** forge and salvage | `loot/forge.ts`, `loot/materials.ts`, `loot/salvage-yield.ts`, `loot/smithing.ts` (hone, imprint, reforge clears `band`), `loot/item-generator.ts` (`materialName`, the band/floor roll), `delve/crafting.ts`, `delve/profile.ts` (`addLootToBag` calls `applySalvage`, `salvageItems`) | Engine suite green |
| | **B3** autopilot and economy (after B1 + B2) | `delve/autopilot.ts`, `economySim`, `tests/delve-pacing.test.ts` | Pacing rails and the four targets |
| **C · Client** (all parallel, after A; wiring real data after B) | **C1** arena and dive | Pickup FX, `ArenaRenderer` material drops, `PurseBar`, `FoundLog`, `StopScreen` / `DoorPane`, `DiveSummary` | Client suite, typecheck |
| | **C2** the Forge tab | `hub/forge/*` | |
| | **C3** Codex, Loadout and the Economy view | `hub/codex/*`, `hub/loadout/ComparePane.tsx`, `features/delve/lab/*` (the Economy view) | |
| **D · Balance and docs** | One area | Tuning to the pacing targets with the Economy view; CLAUDE.md's Delve section | Pacing rails; Delve E2E on `desktop` and `desktop-1080`; responsive probes; a report of the targets met; bump **v0.58.0** |

No two areas in a phase edit the same file: A pre-creates the shared exports and store actions, so B1, B2 and the C areas fill in bodies in their own files.

## Tests

- **Engine:**
  - forging: `previewForge` equals `forgeItem` minus the RNG; shard bands, the attunement floor (on- vs off-pair, the cap, the `u` formula) and Attune overrides are respected; every forge refusal (including a full bag and an essence's slots).
  - refining: counts, prices and the top-grade refusal.
  - sinks: essences make legendaries; reforge clears `band`; imprint and hone refusals.
  - salvage: patterns are learned on salvage; `applySalvage` yields (including a legendary's essence).
  - drops: tables by foe kind (no gear from normals); door multipliers (including the Shrine); Find bumps.
  - banking: the haul banks at floor clear; `beginFloor` clears the haul.
  - settling: `settleDive` runs once per outcome; death and abandon lose the haul plus the share (stochastic, deterministic per seed); extract keeps everything.
  - determinism: a seeded dive is reproducible; schemas reject bad data and non-partitioning metal bands.
- **Pacing:** `tests/delve-pacing.test.ts` rails adapted to forged gear, plus the four pacing targets as assertions.
- **Retired or re-pinned:**
  - retired: fusion tests;
  - re-pinned: the items hash in `tests/delve-movesets.test.ts` (to the new gear roll and drop flow);
  - rewritten for the tables: `tests/delve-loot.test.ts`'s drop-rate tests and the rune contract tests' `dropMult` cases;
  - the migration tests.
- **Client:**
  - **Forge bench:** the preview, the shard picker filtering, the price, forge, and each refusal shown.
  - **Temper:** Hone and Imprint.
  - **Materials pane:** refine and buy.
  - **Dive:** the Found log's grouping, the purse, and the stop's risk line.
  - **Codex and Loadout:** the Codex sections and the salvage preview.
  - **The reset toast.**
  - **E2E:** a dive picks up materials and banks them at the stop; forging an item at the Anvil; death loss shown in the summary.

## Constraints kept

- The engine owns every rule and number; the client shows engine values (`previewForge`, `salvageYield`, prices, refusal reasons).
- Determinism: every roll comes from seeded, forked streams (`materialRng`, `forge:*`, `salvage:*`, `death:*`).
- The dive lock: forging, honing, imprinting, refining and buying are Anvil-only, like today's forge ops.
- The UI follows the v1 kit and the input map (mouse/keyboard and pad first-class; prompts per device).

## Out of scope

- Quests (a later stage).
- Mid-dive crafting spots (anvils, altars): later.
- New legendary powers or affixes (the data model supports adding them).
- Trading or selling beyond the shard bench.
