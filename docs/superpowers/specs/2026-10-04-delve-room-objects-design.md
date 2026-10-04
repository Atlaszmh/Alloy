# Delve: bigger rooms, room objects and smarter packs

Date: 2026-10-04 · Target: v0.63.0, save v12 (older saves reset; no migrations)

## Goal

Fights in the Delve reward kiting: the hero (move speed 5.2) outruns base foes (2.6) around open rectangular rooms with a few pillars. This feature makes rooms bigger and furnishes them with objects that change how fights play (cover, crumbling cover, breakable props, elemental hazards, foliage, slow ground), and makes packs fight together (surround, cut off a kiting hero, use cover, charge through gaps, ambush from foliage), so standing your ground near the right object beats running circles.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Object roles | All four: solid cover, breakables, terrain zones, elemental hazards |
| The foes | Objects + smarter packs (speeds unchanged) |
| Room size | ~1.5×: rooms 12–20 cells; one arena room per floor; boss room ~20×20 |
| How rooms are furnished | Hand-drawn **set pieces** placed by rules, per-biome palettes |
| What breaks | Small props (urns, crates, bone piles, barrels) and **crumbling cover** (cracked walls, statues); solid ruins never |
| Hazards | Any hit bursts them, **the burst hits everyone** (the hero too), foes' attacks set them off too; recharge |
| Terrain | Foliage and slow ground work **both ways** (foes hide and slow too) |
| Approach | **Static things in the grid, living things as entities**: cover, crumbling cover, foliage and slow ground are cell types; props and hazards are entities |

Resolved during review (decided by the integrator; flagged for the user): the leash is measured from the room's edge; the map is a 4×4 coarse grid of 24 (≤ 96×96) with the arena on two coarse cells; only foliage sheds aggro (walls don't); hazard bursts hurt the hero with damage only (the hero has no element stacks) and never grant a perfect dodge; save v12 (a resumed dive would rebuild a different floor).

## 1. Bigger rooms and furnishing

**Sizes and grid.** The generator's coarse grid stays 4×4 with a coarse cell of **24** (`delve.layout.coarseCell`), so maps are at most **96×96**, checked by a schema/data test. Regular room templates are 12–20 cells per side (room + `minWall` fits a coarse cell). One **arena** room per generated floor occupies **two adjacent coarse cells** (a 2×1 block, either orientation): up to 28×22 cells; the room walk, links and `hall()` handle a room spanning two coarse cells. The arena is a combat room holding one more pack than others (`arenaPacks: +1`); it is never the start, exit, den, vault, sanctum, alcove or boss room. The boss room is about 20×20. Floors stay 5–8 rooms; halls stay 3 wide. Room masks (`#`, `%`, `pillarChance`) are retired: set pieces replace them.

**Cell codes** (`FloorMap.cells`, today 0 floor / 1 wall / 2 door): 3 cover, 4 crumbling cover, 5 foliage, 6 slow ground. A parallel `FloorMap.look: Uint8Array` holds each cell's material (which biome stone, foliage kind or slow-ground kind it's drawn as), for the client only. `FloorMap.structures` lists crumbling structures (`{ id, cells, life, maxLife }`). `FloorMap.version` bumps whenever a cell changes (a crumble) or a door opens/closes.

**Two predicates** (phase A routes every reader through one of them and lists each caller):

| Predicate | Blocked by | Used by |
|---|---|---|
| `solid(cell)` | wall, door shut, cover, crumbling cover | movement (`moveCircle`, `snapToWalkable`), flow fields, the bot's map, spawns, projectiles (stop and burst as at walls), area hits, melee arcs, beams, zones, reaction splash — foliage never stops a hit or a shot |
| `perceives(map, a, b)` | `solid` cells, plus foliage (below) | fog, aggro and sight, `nearestMonster`, aim, the bot's targeting |

What differs between movement, shots and hits is entities, not cells: props stop shots and movement (entity checks).

Every raw `cells[...] === 1` reader is converted (`generate.ts` `cellSteps` / `homeField`, `bot.ts` `heroMap`, the client's fog painting, `Minimap.tsx`, the pixel floor's `world.ts`). Props and hazards are not cells (below).

**Set pieces** (`src/data/setpieces.json`, schema-checked at load): ASCII rows with a legend (`#` cover, `c` crumbling cover, `f` foliage, `~` slow ground, `u` a prop spot, `h` a hazard spot, `.` open floor, `?` don't care), size, tags (`edge`, `corner`, `centre`), biomes (or all), weight, and whether it may be mirrored and rotated. Foliage patches are at least 3 cells thick where they're meant to hide. Examples: a collapsed wall line, a statue ring, a ruined chapel corner, a grove with undergrowth, a flooded dip, a brazier pair, minecart wreckage.

**The furnisher** (the floor's fork `furnish`): each room gets a budget by area and kind:

| Room | Furnishing |
|---|---|
| start | light; no hazards |
| combat, arena | medium / heavy (the arena most) |
| den | dense cover |
| vault, sanctum, alcove, exit | light; no hazards within reach of the interactable |
| boss | medium cover, no crumbling cover, no hazards |
| halls | none |

It picks pieces from the biome's palette by weight and tags and places them under the **invariants**, treating prop and hazard footprints (below) as blocked:

- every walkable cell lies in an all-walkable 3×3 (the generator's passage rule) — **checked with each crumbling structure crumbled on its own and the rest intact** (crumbling only adds walkable cells, so every combination then holds);
- each door keeps two clear cells in front of it, inside the room;
- the room's centre (its interactable) stays clear;
- hazards sit at least `radius + 1` from doors, their front cells, the start and every interactable;
- every walkable cell is reachable from the room's doors for the large clearance class.

A piece that would break an invariant is skipped.

**Biome palettes** (data): pieces, props, hazards and slow-ground looks per biome — Cinder Mines timber walls, minecart wrecks, braziers, coal rubble; Frostvault ice pillars, frost crystals, snowdrifts; Storm Foundry machinery, storm coils, oil slicks; Sunken Quarry boulders, vines (foliage), shallow water, spore pods; Bone Crypts tombs, statues, bone piles, shadow braziers; Molten Core obsidian spires, fire vents. Hazards are mostly the biome's element (`hazardOffElement` chance of another).

**Footprints.** A prop's or hazard's footprint is every cell its circle overlaps; every invariant, the flow fields, the `homeField`s, spawns and drop placement treat footprint cells as blocked.

**Spawns.** `pack()` (in `world.ts`) chooses spawn cells that lie in an open 3×3 and outside every footprint; an ambush pack (below) takes foliage cells whose whole 3×3 is foliage (at least one cell inside the patch). "A room with foliage" is a room holding such cells; every biome palette with foliage can host an ambush pack (tested).

The open room (Training Grounds, DPS Lab) and the tutorial's hand-built floors are not furnished and the director is off there.

## 2. Objects in a fight

All numbers in a new `balance.json → delve.terrain` (schema-checked).

**Cover** blocks movement, sight, shots and hits. **Wall slam:** a knocked-back foe that meets cover or a wall during that knockback takes `slamDamage` × the knockback's source hit (stored on the foe) and `slamStagger`, once per knockback; tunable, may be 0.

**Crumbling cover:** each structure has life `structureLife` per cell × the depth's monster-life factor (a helper extracted from `world.ts`'s `growth.monsterHp^d × ramp`). Only heavy and hold blows, ability area forms and hazard bursts damage it, at a structure's **face** (a hit whose area reaches a structure cell adjacent to a walkable cell it sees). At 0 life its cells become slow ground (rubble), a debris burst plays, and `FloorMap.version` bumps.

**Props** (urns, crates, bone piles, barrels): entities (`ArpgWorld.props`: position, radius, life `propLife`, kind) — **fixed circles**: bodies are pushed out of them as from a fixed dummy (movement resolution), and the flow fields mark a prop's cell blocked until it breaks (so foes path around). They don't block sight. Any hit that reaches one breaks it (a shot that meets one stops). On breaking: a chance of scrap or a material (`propDrops`, its own stream), a break frame.

**Hazards** (braziers, frost crystals, storm coils, spore pods, fire vents, shadow braziers): entities (`ArpgWorld.hazards`: element, radius, fuse, recharge, state) — fixed circles whose footprints are blocked in the flow fields like props (foes path around the body but don't avoid the burst radius, so luring a pack onto one still works). Each hit site tests its own shape (an area's circle, a melee arc's cone, a beam's segment, a shot's contact) against the props and hazards it reaches and calls **`hitObject(ctx, obj, source)`** for each; the sites: the hero's direct and area impacts (`impact`, except calls flagged `tick` — Linger, Maelstrom and other zone ticks — and Echo replays), melee arcs, shots on contact (a shot meeting a hazard sets it off and stops), beams; the foes' shots, boss slams and zones, and a charger's dash; and a hazard's own burst (chains). DoT ticks, chain jumps and reaction splash never set one off. A set-off hazard telegraphs for `fuse` (~0.4 s), then bursts: damage (`hazardDamage` × the depth's monster damage) to **everyone** in the radius; foes also take its element's stacks (reactions as usual, source `hazard`; kills count for quests and drops); the hero takes damage only and the floor's `hurt` flag is set. A hazard burst **never grants a perfect dodge** (its `hurtHero` call passes a `noPerfect` flag; the dodge's i-frames still avoid it). Then dormant for `recharge` (~12 s).

**Foliage** (`perceives`): a sight line between two points is blocked if either endpoint stands in foliage and they're farther apart than `foliageSight` (~2.5 units), or if the line crosses more than `foliageDepth` (~1.5 units) of foliage (summed along the DDA, leaving out the endpoints' own cells, so inside a patch the first rule decides: 2.5). So what's inside a bush is seen only up close, a hero inside sees out only that far, and a thick patch hides what's behind it. **Only foliage sheds aggro:** a foe that loses sight of the hero because of foliage goes to the last-seen point (a target field per pack, rebuilt at the director's cadence), searches `searchTime`; if no member of its pack perceives the hero by then, the pack walks home down its room's `homeField` and goes back to sleep as after a leash (healing as the leash does); any member perceiving the hero again re-aggroes the pack. Walls and cover don't shed aggro (pursuit through the flow field as today). The hero's automatic attack targets only perceived foes (already so).

**Slow ground:** anyone walking on it moves at `slowMult` (0.6) × speed (pushes from swings and forms too); bosses at `bossSlowMult` (0.8). The dodge, knockback and a charger's dash ignore it. The dash, like today's separation, passes through props and hazards (a hazard's burst can still catch the hero outside the dash's i-frames).

**The leash** is measured from the room's **rect** (`leashMargin` outside its edge), not its centre, so a pack anywhere inside its room — the arena included — never leashes; intercept points stay inside the room.

## 3. Smarter packs

A **pack director** (`arpg/pack.ts`), every `directorEvery` (~0.25 s), assigns each awake foe a job and a target, using BFS fields per pack bounded by `flowRadius` (cheap at 96²); each job has an enable flag and its numbers in `delve.ai.pack`; it iterates foes in list order (deterministic). Bosses keep their patterns; their adds use the director. Off on the open room and tutorial floors.

- **Ring slots:** melee foes take slots on a ring around the hero (spread by angle).
- **Flankers:** when the hero has kept moving away from the pack's centre for `kiteTime`, `flankShare` of melee foes (0 at depths 1–2, rising with depth) go to an **intercept** point: ahead of the hero's motion (`leadTime`) or on its far side from the pack, inside the room.
- **Ranged use cover:** a ranged foe picks, within `coverSearch`, a walkable cell that perceives the hero and lies next to cover (a short per-foe BFS); fires from there; steps behind the cover between volleys; relocates when the hero comes within `coverFlee`.
- **Chargers:** dash along an open lane (a swept circle of the charger's radius); meeting cover or a wall stuns them (`chargeStun`) and slams them for `chargeSlam` × their own hit damage.
- **Ambushers:** with `ambushChance` a pack in a room with foliage (above) spawns inside it asleep and unseen; it wakes when the hero comes within `ambushWake` or any pack in its room wakes.
- **No pinning:** no foe stays pressed against a prop, hazard or cover for more than `stuckTime` (tested; the flow fields route around footprints).

## 4. Client

- **Art** (16 sprite pixels per unit; `packages/pixel-forge`): cover painted by the pixel floor as low ruins in each biome's stone; statues, pillars, boulders, obsidian spires as sprites; crumbling cover with growing cracks, a debris burst, rubble; props (two or three per biome) with a break frame; hazards one sprite per kind with ready / primed / dormant states. Foliage, mud, shallow water, snowdrift and oil drawn by the pixel floor from the real cells (`look`). **The pixel floor's random rivers, pools and wild foliage are replaced** by cell-driven terrain; purely decorative ground stays only where it can't be mistaken for terrain (tints, pebbles, cracks). Foliage turns see-through around the hero while inside it.
- **FX:** a hazard's telegraph (a mana-pixel ring) and burst; wall-slam hits; a stunned charger; prop breaks; crumble debris.
- **Refresh on `FloorMap.version`:** the renderer's fog painting, the minimap (cover drawn, hazards as dots), and the pixel floor's worker (a message when cells change).
- Out-of-sight rules apply to props and hazards in unseen cells.

## 5. The bot, pacing, testing

- **The bot:** its map and fields follow `FloorMap.version`; slow ground costs more (a 0-1/Dijkstra field for the bot's paths); it steps out of a primed hazard's radius; it breaks props in its way; it explores unseen foliage.
- **Pacing:** the depth rails stay as they are; the floor-time bands become **thorough 40–75 s, rush 25–55 s** (the bot's times), and the content (packs per room, furnishing budgets, director numbers) is tuned to meet them; report depth, deaths and seconds per floor before/after.
- **Engine tests:** the furnishing invariants over many seeds × biomes × depths (props and hazards blocked; each structure crumbled alone; large-class reachability; hazard distances); the leash never firing inside a room (arena included); the two predicates per caller; foliage sight (both rules); only foliage shedding aggro; slow ground (dash, knockback and charges exempt; the boss multiplier); crumble → rubble bumping the version and refreshing flow fields, sight and fog; wall slam once per knockback; prop break and drops; hazards: the hit sites that set them off and those that don't, fuse, burst on everyone, the hero damage-only and `hurt`, no perfect dodge, chain, recharge; the director's jobs; spawns; determinism.
- **Client tests** for the new drawing paths and refreshes; the existing E2E still complete dives.

## Out of scope

Destructible solid ruins; foes deliberately using hazards; new monster kinds; hero element stacks; changes to hero or foe speeds; furnishing the tutorial floors or the Training Grounds.

## Phases and parallel areas (for the plan)

- **A — contract:** cell codes, `look`, `structures`, `version`; the two predicates (`solid`, `perceives`) with every caller routed and listed; `ArpgWorld.props` / `hazards` types; `hitObject` signature and each hit site's shape test (no-op); `setpieces.json` + schema; `delve.terrain` and `delve.ai.pack` + schemas; the coarse grid (24, ≤ 96 check); the monster-life helper; `HitSource 'hazard'`; typed stubs for the furnisher, terrain effects, props, hazards and the director; hooks in `step.ts`; save v12.
- **B (engine, in parallel):** B1 bigger rooms + the arena (two coarse cells) + the furnisher + set pieces and palettes + spawns; B2 terrain mechanics (foliage sight and aggro, slow ground, cover, crumbling structures, wall slam, the leash from the rect — re-run the tutorial's floor and bot tests, since the leash change reaches its hand-built floors); B3 props and hazards (`hitObject`); B4 the pack director; B5 the bot and pacing (after B1–B4).
- **C (client, in parallel):** C1 the pixel floor's terrain and cover painting from cells (random dressing replaced), foliage see-through, the worker message; C2 sprites (pixel-forge) for statues, props and hazards; C3 FX, the minimap and fog refresh on `version`.
- **D:** E2E, CLAUDE.md, balance check, v0.63.0.
