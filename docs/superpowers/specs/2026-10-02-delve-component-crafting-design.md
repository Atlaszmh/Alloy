# Delve component crafting and the materials economy (stage 4c)

**Status:** design approved in conversation, 2026-10-02. Builds on v0.57.1 (runes and rune costs, weapon movesets, the Delve UI v1). Ships as **v0.58.0** with **save v8** (old saves reset; no migration).

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

## The materials

Everything refines upward; nothing is dead loot. All materials and currencies live in a **materials pouch** on the profile (no bag space), like the rune pouch.

| Material | Kinds | What it does | Refines |
|---|---|---|---|
| **Metal bars** | 7: Rusty, Iron, Steel, Mithril, Adamant, Starforged, Voidforged (today's `delve.json → materials` names) | Sets a forged item's **item-level band** | `refine.metal` (3) bars → 1 of the next metal, + scrap |
| **Flux** | 4 grades: uncommon, magic, rare, epic | Bar + flux = an **ingot of that rarity** at forge time; no flux = common | `refine.flux` (3) → 1 of the next grade, + scrap |
| **Affix shards** | One per affix (29 today), tiers I–V | Guarantees a line on a forged item; its value rolls within the tier's range | `refine.shard` (3) → 1 of the next tier, + scrap |
| **Essences** | One per legendary power (12 today) | Epic flux + an essence = a **legendary** ingot carrying that power | — |
| **Patterns** | One per base (13 today) | Learned, not held; stored on the profile, shown in the Codex | — |
| **Currencies** | Scrap, Mana Dust, Links | Now all **floor drops** (Links no longer come only from weapons) | — |
| **Runes** | Unchanged | — | Unchanged (3 → 1) |

The two-axis ingot (bar × flux) keeps the pouch to 7 + 4 kinds instead of 42 ingot variants.

## Forging an item (the Forge bench)

The player chooses, in order:
1. **Pattern:** any learned base.
2. **Metal bar:** sets the item level. Each metal has an ilvl band `[lo, hi]` (data). The item's ilvl = `clamp(deepestDepth, lo, hi)`: a better metal raises the ceiling, going deeper raises where you land in it. A metal above your deepest depth forges at its `lo`.
3. **Flux:** none → common; a grade → that rarity; **legendary = epic flux + an essence** (the essence's power, rolled as today).
4. **Element:** either element of the hero's pair is free; any other element costs `crafting.offPairDust` Mana Dust. A hero without a bound secondary chooses from the primary (or pays for another).
5. **Shards:** up to the rarity's line count (`loot.affixCount`, today 0/1/2/3/4/4). Each shard guarantees its affix line, and its value rolls within the shard tier's roll range (`crafting.shardTiers[t] = { min, max }` as fractions of the affix's ilvl-scaled range). The same affix can't be chosen twice, and only affixes allowed on the base's slot can be chosen. **Lines left empty roll at random** with today's weighted pool and the rarity's `minRoll`.
6. **Price:** scrap from `crafting.forgeScrap` by rarity × the metal's scaling factor, plus the consumed bar, flux, essence and shards. Shown before committing.

**Attunement raises rolls (decision 11).** For an item whose element is in the hero's pair, every roll on it (forge, hone, reforge, imprint) has its floor lifted: `floor = max(rarityFloor, min(attuneCap, attunePerPoint × attunement[element]))`, where `attunement` is the hero's current attunement in that element (`profileStats`). The floor applies inside a shard's tier band too (`roll = lerp(tierMin, tierMax, max(floor, r))`). Off-pair items get no bonus. Numbers: `crafting.attuneRoll { perPoint, cap }`.

**Weapons** come out with their rarity's carried skills (`movesets.carries`, unchanged) and a fixed number of extra slots and open sockets: the **low end** of today's `movesets.extraSlots` / `runes.socketDrops` ranges by rarity (data: `crafting.weaponExtras`). Links still buy more, and Transfer still moves a moveset onto the new weapon.

**Preview.** Before committing, the bench shows each line's possible range (shard lines in their band, random lines as "random"), the attunement floor in effect, the implicits at the chosen ilvl, the price, and (for weapons) carried skills, slots and sockets. The preview and the forge are one engine function so they never disagree (`previewForge` returns what `forgeItem` would roll, minus the RNG).

**Determinism.** Forging uses a forked RNG stream `forge:${forgeCount}` as reforging does today.

## The "just right" sinks (the Temper bench)

On any owned item, between dives:

| Operation | Effect | Price |
|---|---|---|
| **Hone** *(new)* | Reroll one line's value within its current band (a shard line keeps its tier band; a random line its rarity range). Attunement floor applies. | Scrap, `crafting.honeScrap × honeGrowth^hones` (per item) |
| **Reforge** *(exists)* | Replace one line with a random different affix. | As today (`forge.reforge*`) |
| **Imprint** *(new)* | Replace any line with a chosen shard (its affix, rolled in the shard's band). | The shard + `crafting.imprintScrap` by rarity |
| **Upgrade** *(exists)* | +1…+10, each +10% to all stats. | As today |
| **Re-attune** *(exists)* | Change element within the pair. | As today (Mana Dust) |

Each line remembers its origin for honing: `StatRoll` gains `band?: { min, max }` (absent = the rarity's default range). Items record `hones` like `reforges`.

**Alloy Fusion is removed** (`fuseItems`, `fuseGear`, `checkFusion`, the Fuse bench, `forge.fuseCost`): refining flux replaces "three items into a better one".

## Salvage (what gear gives back)

Salvaging an item returns:
- **Scrap**, as today (`forge.salvage`).
- **Shards:** one shard of one of its lines (chosen at random among its affix lines), at a tier from that line's roll quality (`crafting.salvageShardTier`: roll thresholds → tier), plus a `crafting.salvageExtraShard` chance of a second from another line. A common item (no lines) gives none.
- **Its pattern**, if not yet learned.
- **Its essence**, if legendary (and no shard).
- **Links** from a weapon's extra slots and sockets, and its runes by the parts rule, as today.
- **Mana Dust** for an off-pair item, as today.

`salvageCandidates` and auto-salvage keep their rules. Salvage previews (what it yields) are an engine function used by the UI.

## Drops and the economy

**Drop tables** (`balance.json → delve.drops`), per foe kind, roll materials on kill:
- **Normal:** scrap pickups (no longer credited straight to the purse), and chances of a metal bar, Mana Dust, a tier-I/II shard, or (rarely) a Link. **No gear.**
- **Elite:** a guaranteed bundle (bars, a shard, often flux or Links) and a `drops.elite.gearChance` chance of one gear item (rolled as today's drops at the floor's ilvl).
- **Boss:** one gear item (rare or better, as today's first boss item), flux, shards, and an `drops.boss.essenceChance` chance of an essence.
- **First boss:** guarantees an essence plus an epic flux (replacing today's forced legendary item), so the first legendary is forged by the player; it doubles as the forge tutorial.
- **Runes:** unchanged.

**Metal by depth:** a dropped bar is the metal whose band contains the floor's ilvl, with `drops.metalUpChance` of the next metal.

**Find** (today's magic find): no longer raises gear rarity; it raises flux grade and shard tier odds (`drops.find`). The `magicFind` affix keeps its id and changes meaning; its label becomes "Find".

**Leanings** (data):
- each **biome** weights shard affixes by family (`crafting.families` maps affixes to families: offense, defense, sustain, utility, element; `drops.biomeShardWeights[biome][family]`), and its element's Power/Attune shards;
- each **door** adjusts the mix (`drops.doors[doorId]`): gilded more flux and essences; cursed higher shard tiers; swarm more materials overall; champions more elites (so more gear). Today's door `magicFind` / `dropMult` fields are replaced by these.

**The shard bench** (Anvil, Materials pane): buy any **tier I** shard for `crafting.shardBench { scrap, dust }`; higher tiers come from refining. Bad-luck protection and a sink.

**Banking and death (decision 10).**
- Materials picked up during a floor ride in the floor's haul; when the floor is cleared (the stop), the haul **banks** into the dive's banked materials, and the pouch updates when the dive closes or on extract (as items bank today).
- **Dying** loses the current floor's haul and `crafting.deathLoss` (0.4) of each material the dive had banked (rounded down per kind); the stockpile from earlier dives is never touched. The scrap bounty is lost as today.
- **Extract** keeps everything.

**Gear drops** still go to the bag (cap 40, auto-salvage unchanged).

**Pacing targets** (the balance phase tunes the numbers to these, measured by the pacing rails and the Economy view):
- after **dive 1**: enough to forge a magic item;
- by about **dive 5**: a first epic;
- the **first boss**: a first legendary, forged;
- over **12 dives**: depth progression at least matches today's rails (`tests/delve-pacing.test.ts`).

## Arena and pickups

- Material drops are a new drop kind: small pixel pickups by material (colour by kind: metal by metal, flux by grade, shards by family colour, Dust cyan, Links teal, scrap gold), bursting from the kill.
- **Magnet:** within `drops.magnetRadius` arena units the pickup flies to the hero (`drops.magnetSpeed`) and is collected on contact. Gear and essences stay walk-over with plaques (essences get a legendary-orange plaque).
- The engine emits a `pickup` event per material (kind, id, amount) for the HUD and the floor; pickups are deterministic (they ride `world.dropRng`/a forked stream, not `Math.random`).

## The client

**Arena HUD:**
- **Purse bar:** scrap, Links, Mana Dust, and a **materials** total, each with this dive's gain; a tooltip lists the materials.
- **Found log:** groups materials ("Iron bar ×3") above gear and essences.

**Stop:** "Found this floor" groups materials; a line states the death risk ("Dying costs this floor's haul and 40% of the dive's materials"). The `equip` power-up stays (offered only with a bag item, as today); a new stop kind is not added.

**Dive summary:** materials gained (and lost on death).

**Forge tab (three panes):**
- **Forge bench (new, left/centre):** pattern grid (learned bases), metal and flux pickers with counts, element choice, shard slots (up to the rarity's lines) with a shard picker filtered to the base's slot, the live preview, the price, and **Forge** (Enter / A).
- **Temper bench:** Hone, Reforge, Imprint, Upgrade, Re-attune on the selected item.
- **Materials pane:** bars, flux, shards (by family and tier), essences and runes, each row with **Refine 3→1**; the **shard bench** (buy tier I).
- The Fuse bench is removed.

**Codex:** gains **Patterns** (learned / unknown, with where they come from) and **Essences** (seen / unknown).

**Loadout:** the compare pane's Salvage shows what it yields (shards, pattern, essence, Links, Dust, scrap).

**Pause:** read-only as today; the Forge tab stays locked mid-dive.

## Tuning: every number in data

- **`src/data/crafting.json`** (new, `CraftingDataSchema`, via `registry.getCraftingData()`):
  - `metals[]`: `{ id, name, band: [lo, hi], scale }` (replaces `delve.json → materials` for names; item names keep using it);
  - `flux[]`: `{ id, grade }`;
  - `shardTiers[]`: `{ tier, min, max }` roll bands;
  - `families`: affix → family;
  - `startingPatterns[]`;
  - `essences`: legendary id → essence id (one per legendary).
- **`balance.json → delve.crafting`** (`CraftingBalanceSchema`): `forgeScrap`, `offPairDust`, `honeScrap`, `honeGrowth`, `imprintScrap`, `refine { metal, flux, shard, scrap }`, `attuneRoll { perPoint, cap }`, `weaponExtras`, `salvageShardTier`, `salvageExtraShard`, `shardBench`, `deathLoss`.
- **`balance.json → delve.drops`** (`DropsBalanceSchema`): per foe kind `{ scrap, bars, dust, links, shards: { chance, tiers }, flux: { chance, grades }, gearChance, essenceChance }`, `metalUpChance`, `find`, `biomeShardWeights`, `doors`, `magnetRadius`, `magnetSpeed`.
- Removed tunables: `forge.fuseCost`; `loot.rarityWeights` / luck now only roll gear drops from elites and bosses.
- **Economy view** (dev only, a new view in the DPS Lab): runs the autopilot for N dives (seeds selectable) and charts, per dive, income and spending per material, items forged by rarity, the deepest depth, and deaths. It reuses the engine's autopilot and a pure `economySim(registry, seed, dives)` that the pacing tests can also call.

## Engine shape (for the plans)

- **Types** (`src/types/crafting.ts`): `MetalId`, `FluxGrade`, `ShardRef { affix, tier }`, `MaterialsPouch { metals: Record<MetalId, number>; flux: Record<FluxGrade, number>; shards: Record<affix, number[5]>; essences: Record<essenceId, number> }`, `ForgeRequest { baseId, metal, flux?, essence?, element, shards: ShardRef[] }`, `ForgePreview`, `SalvageYield`.
- **Profile v8:** `materials: MaterialsPouch`, `patterns: string[]`, `links`, `manaDust`, `scrap`, `runes` (as today); `DiveState` gains `haul` (this floor's materials) and `banked` (the dive's banked materials). The v2–v7 migration chain is **deleted**; loading anything but v8 resets the save with a toast.
- **Modules:** `src/loot/materials.ts` (pouch ops, refine, drop tables → material rolls), `src/loot/forge.ts` (`previewForge`, `forgeItem`, `honeLine`, `imprintLine`, roll bands, the attunement floor), `src/delve/crafting.ts` (profile ops with the dive lock: `forge`, `hone`, `imprint`, `refine`, `buyShard`, salvage yields), `src/arpg/material-drops.ts` (kill → material pickups, magnet, collection), dive banking and death loss in `src/delve/dive.ts`.
- **Autopilot:** forges its gear: each dive it forges the best affordable item per slot (shards toward its stat priorities, its pair element), hones while scrap allows, refines surplus, salvages gear drops it doesn't wear, and still spends Links on slots and sockets.
- **Power, DPS Lab, pacing rails:** unchanged in meaning; the rails' gear assumptions move to forged gear.

## Phases and parallel areas

| Phase | Areas (parallel within a phase) | Gate |
|---|---|---|
| **A · Contract** (first, by the integrator) | Types, `crafting.json` and the two balance blocks with schemas and starting numbers, registry getters, profile v8 + reset, deleting Fusion and the migrations | Engine builds; existing tests updated or removed for deleted features |
| **B · Engine** | **B1** drops, pickups, magnet, banking, death loss (arpg + dive) · **B2** forge, hone, imprint, refine, shard bench, salvage yields, patterns, essences, the attunement floor (loot + delve) · **B3** autopilot on forging, `economySim` | Engine suite green; determinism (same seed → same dive); pacing rails pass after B3's tuning |
| **C · Client** | **C1** arena pickups and FX, HUD purse and Found log, stop, dive summary · **C2** Forge tab (Forge bench, Temper, Materials pane) · **C3** Codex patterns/essences, Loadout salvage preview, the Economy view | Client suite, typecheck, Delve E2E on `desktop` and `desktop-1080`, responsive probes |
| **D · Balance and docs** | Tune to the pacing targets with the Economy view; update CLAUDE.md's Delve section | Pacing rails; a written report of the targets met; bump **v0.58.0** |

## Tests

- **Engine:** forge preview equals forge (minus RNG); shard bands respected; attunement floor (on- vs off-pair; capped); refine counts and prices; essences → legendary; patterns learned on salvage; salvage yields; drop tables by foe kind (no gear from normals); magnet collection; banking at floor clear; death loss (floor haul + share of banked, never the stockpile); determinism of a seeded dive; schemas reject bad data.
- **Pacing:** `tests/delve-pacing.test.ts` rails adapted to forged gear plus the four pacing targets as assertions.
- **Retired:** fusion tests; the items-hash lock (`tests/delve-movesets.test.ts` 291-item hash) is re-pinned to the new drop flow; drop-rate tests rewritten for the tables.
- **Client:** Forge bench (preview, shard picker filtering, price, forge), Temper ops, Materials pane refine/buy, Found log grouping, purse, stop risk line, Codex sections, salvage preview; E2E: a dive picks up materials and banks them; forging an item at the Anvil; death loss shown.

## Constraints kept

- The engine owns every rule and number; the client shows engine values (`previewForge`, salvage yields, prices).
- Determinism: every roll from seeded, forked streams.
- The dive lock: forging, honing, imprinting, refining and buying are Anvil-only (refused mid-dive), like today's forge ops.
- The UI follows the v1 kit and the input map (mouse/keyboard and pad first-class; prompts per device).

## Out of scope

- Quests (a later stage).
- Mid-dive crafting spots (anvils, altars): later.
- New legendary powers or affixes (the data model supports adding them).
- Trading or selling to vendors beyond the shard bench.
