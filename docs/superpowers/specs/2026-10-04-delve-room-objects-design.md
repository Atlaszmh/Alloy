# Delve: bigger rooms, room objects and smarter packs

Date: 2026-10-04 · Target: v0.63.0 (no save change: floors rebuild from their seed)

## Goal

Fights in the Delve reward kiting: the hero (move speed 5.2) outruns base foes (2.6) around open rectangular rooms with a few pillars. This feature makes rooms bigger and furnishes them with objects that change how fights play (cover, crumbling cover, breakable props, elemental hazards, foliage, slow ground), and makes packs fight together (surround, cut off a kiting hero, use cover, charge through gaps, ambush from foliage), so standing your ground near the right object beats running circles.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Object roles | All four: solid cover, breakables, terrain zones, elemental hazards |
| The foes | Objects + smarter packs (speeds unchanged) |
| Room size | ~1.5×: rooms 12–20 cells; one arena room per floor 22–28; boss room ~20×20 |
| How rooms are furnished | Hand-drawn **set pieces** placed by rules, per-biome palettes |
| What breaks | Small props (urns, crates, bone piles, barrels) and **crumbling cover** (cracked walls, statues); solid ruins never |
| Hazards | Any hit bursts them, **the burst hits everyone** (the hero too), foes' attacks set them off too; recharge |
| Terrain | Foliage and slow ground work **both ways** (foes hide and slow too) |
| Approach | **Static things in the grid, living things as entities**: cover, crumbling cover, foliage and slow ground are cell types; props and hazards are entities |

## 1. Bigger rooms and furnishing

**Sizes** (`layouts.json` templates and `balance.json → delve.layout`): regular room templates 12–20 cells; one **arena** room per generated floor (22–28 cells; a combat room carrying the floor's biggest pack; never a den, vault, sanctum, alcove or boss room); the boss room about 20×20. Floors stay 5–8 rooms; halls stay 3 wide; the map size limit rises (today ≤ 64×64) to fit (about 96×96). The coarse grid the generator lays rooms on grows to fit.

**Cell types** (`FloorMap.cells`, today 0 floor / 1 wall / 2 door) gain:

| Cell | Movement | Sight | Shots |
|---|---|---|---|
| cover (ruined walls, statues, pillars, boulders) | blocked | blocked | stop (burst as at walls) |
| crumbling cover (cracked walls, statues) | blocked | blocked | stop |
| foliage | open | through at most `foliageDepth` (~2.5 units) of foliage | pass |
| slow ground (rubble, mud, shallow water, snowdrift, oil) | open, slowed | open | pass |

A cell also carries its look (`FloorMap.look` or a parallel array: which biome material a cover, slow-ground or foliage cell is drawn as), for the client only. Every existing reader of `blocked` / `isWalkable` / `lineOfSight` / `sees` / `doorShut` treats cover and crumbling cover as walls; foliage and slow ground are walkable. Today's room masks (`#`, `%`) become cover.

**Set pieces** (`src/data/setpieces.json`, schema-checked at load): each piece is ASCII rows with a legend (cover, crumbling cover, foliage, slow ground, a prop spot, a hazard spot, open floor, "don't care"), its size, tags (`edge`, `corner`, `centre`), the biomes it suits (or all), a weight, and whether it may be mirrored and rotated. Examples: a collapsed wall line, a statue ring, a ruined chapel corner, a grove with undergrowth, a flooded dip, a brazier pair, minecart wreckage.

**The furnisher** (on the floor's own fork, e.g. `layout.fork('furnish')`): each room gets a budget by its area and kind (dens dense cover, vaults and the alcove light, the arena most, halls none), picks pieces from its biome's palette by weight and tags, and places them under the **invariants** (checked by tests over many seeds, biomes and depths):

- every walkable cell lies in an all-walkable 3×3 (cover and crumbling cover count as blocked; the generator's existing passage rule), so large foes still path everywhere;
- each door keeps two clear cells in front of it, inside the room;
- the room's centre (its interactable) and every spawn point stay clear and reachable;
- every walkable cell of the room stays reachable from its doors for the large clearance class.

A piece that would break an invariant is skipped. Rubble left by crumbled cover is slow ground, so the invariants hold after any crumble.

**Biome palettes** (data): which pieces, props, hazards and slow-ground looks each biome uses, e.g. Cinder Mines timber walls, minecart wrecks, braziers, coal rubble; Frostvault ice pillars, frost crystals, snowdrifts; Storm Foundry machinery, storm coils, oil slicks; Sunken Quarry boulders, vines (foliage), shallow water, spore pods; Bone Crypts tombs, statues, bone piles, shadow braziers; Molten Core obsidian spires, fire vents. Hazards are mostly the biome's element, with an occasional other one (`hazardOffElement` chance).

The open room (Training Grounds, DPS Lab) and the tutorial's hand-built floors are not furnished; the tutorial floors' ASCII legend learns the new cell symbols for later use.

## 2. Objects in a fight

All numbers in a new `balance.json → delve.terrain` (schema-checked).

**Cover** blocks movement, sight and shots. Area hits already need line of sight, so cover shields from blasts both ways. **Wall slam:** a foe knocked back into cover or a wall takes `slamDamage` (a fraction of the hit) and a short stagger (`slamStagger`); tunable, may be 0.

**Crumbling cover:** each set piece's connected crumbling cells form one **structure** with life (`structureLife` per cell, × the depth's monster-life factor). Only heavy and hold blows, ability blasts (area forms) and hazard bursts damage it (light and medium blows don't). At 0 life its cells become rubble (slow ground), a debris burst plays, and the map's version bumps so flow fields, sight caches, fog and the minimap refresh (as door changes do today).

**Breakable props** (urns, crates, bone piles, barrels): entities (`ArpgWorld.props`) with a position, a radius, life (`propLife`, one or two hits) and a kind. They block movement (foes path around them: their cells count as blocked for the flow fields until broken) but not sight; a shot that meets one stops and breaks it; any hit breaks it. On breaking: a chance to drop scrap or a material (`propDrops`, a table like `drops`'s, on its own stream), a break animation.

**Hazards** (braziers, frost crystals, storm coils, spore pods, fire vents, shadow braziers): entities with an element, a radius, damage (scaled by depth), stacks, a fuse, a recharge. **Any hit** sets one off: the hero's, a foe's, a blast in reach, another hazard's burst. It telegraphs for `fuse` (~0.4 s; a monster-zone-style telegraph, so a perfect dodge counts), then bursts: damage and its element's stacks to **everyone** in the radius (the hero included), reactions by the usual rules (credited to a `hazard` source; kills count for quests and drops as any kill). Then it is dormant for `recharge` (~12 s). Hazards block movement (a small radius), not sight.

**Foliage:** a sight line may cross at most `foliageDepth` (~2.5 units) of foliage; so inside foliage you're seen only up close, and see out only that far. Foes that lose sight go to where they last saw the hero, search briefly (`searchTime`), then leash home as today. The hero's automatic attack targets only visible foes (already so), so foes in foliage are an ambush. The fog marks foliage cells seen; what's inside stays hidden.

**Slow ground:** anyone crossing it moves at `slowMult` (0.6) × speed; bosses at `bossSlowMult` (0.8). The dodge's dash ignores it.

## 3. Smarter packs

A **pack director** (`arpg/pack.ts`), run every `directorEvery` (~0.25 s), reassigns each awake foe's job using the flow fields and sight already in place; bosses keep their own patterns (their adds use the director):

- **Ring slots:** melee foes take slots on a ring around the hero (spread by angle) instead of one shared target point, so packs surround rather than trail in a line.
- **Kiting detection and flankers:** when the hero has kept moving away from the pack's centre for `kiteTime`, a share of melee foes (`flankShare`, rising with depth) switch to **intercept**: a point ahead of the hero's motion (`leadTime`) or on the hero's far side from the pack, reached by the flow field toward that point.
- **Ranged use cover:** a ranged foe picks, within `coverSearch`, a walkable cell that sees the hero and lies next to cover; it fires from there and steps behind the cover between volleys; it moves to the next such cell when the hero closes within `coverFlee`.
- **Chargers:** a charger aims its dash along an open lane to the hero; if it hits cover or a wall it is stunned (`chargeStun`) and takes slam damage.
- **Ambushers:** with `ambushChance` a pack whose room has foliage spawns inside it asleep and unseen; it wakes when the hero comes within `ambushWake` or the pack wakes.
- **Hazards:** foes don't steer around them (they can be lured onto them); their attacks can set them off.

How many foes flank and how strongly each job applies scale with depth (`delve.ai.pack`), so early floors stay readable. Deterministic: the director reads only world state and seeded streams.

## 4. Client

- **Art** (16 sprite pixels per unit; built in `packages/pixel-forge`): cover painted by the pixel floor as low ruins in each biome's stone (like cliffs, lower); statues, pillars, boulders and obsidian spires as sprites; crumbling cover with growing cracks, a debris burst and rubble; props (two or three per biome) with a break frame; hazards one sprite per kind with ready / primed / dormant states. Foliage, mud, shallow water, snowdrift and oil from the pixel floor's foliage and water simulation, now driven by the real cells; foliage turns see-through around the hero while inside it.
- **FX:** a hazard's telegraph (a mana-pixel ring) and its burst in its element; wall-slam hits; a stunned charger; prop breaks; crumble debris.
- **Minimap:** cover drawn; hazards as dots.
- Out-of-sight rules (C1 of floor maps) apply to props and hazards inside unseen cells.

## 5. The bot, pacing, testing

- **The bot:** slow ground costs more in its pathing; it steps out of a primed hazard's radius; it breaks props in its way; it explores unseen foliage; the tutorial bot is unaffected (hand-built floors aren't furnished).
- **Pacing:** re-measure the rails (bigger rooms make floors longer); re-band the floor-time bands to the bot's new times; report depth, deaths and seconds per floor before/after.
- **Engine tests:** the furnishing invariants over many seeds × biomes × depths; foliage sight depth; slow ground (dash exempt, boss multiplier); crumble → rubble refreshing flow fields, sight and fog; wall slam; prop break and drops; hazard fuse, burst on everyone, perfect dodge, chain, recharge; the director (flankers cut off a kiting hero, ranged pick cover cells, chargers stun on walls, ambushers wake); determinism.
- **Client tests** for the new drawing paths; the existing E2E still complete dives.

## Out of scope

Destructible solid ruins; foes deliberately using hazards; new monster kinds; changes to hero or foe speeds; furnishing the tutorial floors or the Training Grounds.

## Phases and parallel areas (for the plan)

- **A — contract:** the cell types and `look`, every blocking/sight reader routed through one rule, `ArpgWorld.props` and hazard entity types, `setpieces.json` + schema, `delve.terrain` and `delve.ai.pack` balance + schemas, the map size limit, typed stubs for the furnisher, terrain effects, props, hazards and the director, hooks in `step.ts`.
- **B (engine, in parallel):** B1 bigger rooms + the arena + the furnisher + set pieces and palettes (data); B2 terrain mechanics (foliage sight, slow ground, cover, crumbling structures, wall slam); B3 props and hazards; B4 the pack director; B5 the bot and pacing (after B1–B4).
- **C (client, in parallel):** C1 the pixel floor's terrain and cover painting, foliage see-through; C2 sprites (pixel-forge) for statues, props and hazards; C3 FX and the minimap.
- **D:** E2E, CLAUDE.md, balance check, v0.63.0.
