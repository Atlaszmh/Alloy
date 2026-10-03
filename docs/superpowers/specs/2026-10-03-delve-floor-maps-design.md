# Delve floor maps (procedurally generated rooms and halls)

**Status:** design approved in conversation, 2026-10-03; revised after the spec review the same day. Builds on v0.59.0 (quests, crafting, the v1 UI). Ships as **v0.60.0** with **save v10** (`DiveState` gains fields; older saves reset, no migration).

## Why

Every Delve floor today is the same empty 26 × 40 rectangle: packs placed at random, no walls, no terrain, and the floor ends when everything is dead. The user wants **more interesting, procedurally generated maps with multiple rooms to walk through and areas to explore**.

## Decisions (the user's)

| # | Question | Decision |
|---|---|---|
| 1 | What ends a floor? | **Find the exit; rooms are optional.** Side rooms hold extra packs and rewards; explore for loot or push on. |
| 2 | Map shape | **Rooms + short halls:** 5–8 rooms of varied sizes on a grid graph with a few loops; combat in rooms, halls as transitions. |
| 3 | Floor size | **Compact:** 5–8 rooms (growing a little with depth); a beeline ~45–90 s, a full clear ~2–3 min. |
| 4 | Special rooms | **Treasure vault, elite den, shrine, anvil alcove** (plus start, combat, exit, boss). |
| 5 | Discovery | **Fog of war:** rooms appear as you see into them; the exit isn't marked until found (a compass hint after ~60 s). |
| 6 | Doors | **Only special rooms seal** (elite dens and the boss room) until cleared; normal rooms stay open, and monsters leash home. |
| 7 | Technique | **A tile grid** for collision, line of sight, flow-field pathing, fog and the minimap. |

### Decided in the spec (the user can override)

| # | Question | Decision |
|---|---|---|
| S1 | Replays | A floor replayed (reload, "Anvil · floor restarts") has the same map, but **interactables already used this dive stay used** (`DiveState.used`), and gear and patterns already given stay given (`dropsGiven`). |
| S2 | Shrine buffs | Last **for the floor** or **for the dive** (`DiveState.diveBuffs`); a potion-refill shrine is one use per dive per shrine. |
| S3 | Rushing and contracts | `clearFloor` carries `roomsCleared`. "Clear a floor without a potion / without damage" contracts and Untouchable require at least `minRoomsCleared` (data), so sneaking to the exit doesn't complete them. |
| S4 | Monster rolls | Generated floors place packs per room, so a floor's monsters differ from v0.59.0's for the same seed (accepted; determinism is per generated floor). |
| S5 | Names | The shrine **room** kind's id is `sanctum` (shown as "Shrine"), so it doesn't clash with the "Quiet Shrine" door. |

## The map model

**Grid:** a floor is a grid of 1-unit cells (`Cell = 0 floor | 1 wall | 2 door`). Out of bounds counts as wall.

**`FloorMap`** (`src/types/floor-map.ts`):
```ts
interface FloorMap { width: number; height: number; cells: Uint8Array; rooms: Room[]; doors: Door[]; start: Vec; exit: Vec; open: boolean }
interface Room { id: number; kind: RoomKind; rect: Rect; mask?: Uint8Array /* pillars, rubble */; homeField?: Uint16Array; revealed: boolean; cleared: boolean; sealed: boolean; interactable?: Interactable }
type RoomKind = 'start' | 'combat' | 'den' | 'vault' | 'sanctum' | 'alcove' | 'exit' | 'boss'
interface Door { id: number; cells: Vec[]; rooms: [number, number]; closed: boolean }
interface Interactable { id: string /* `${depth}:${roomId}` */; kind: 'chest' | 'shrine' | 'alcove' | 'gate'; x: number; y: number; used: boolean; shrine?: ShrineId }
```

**Two layouts.** `FloorOptions.layout: 'open' | 'generated'`, defaulting to **`'open'`**.
- **`'open'`** (`openRoom(width, height)`) is today's arena exactly:
  - one room of `arena.width × arena.height`;
  - the hero at `(w/2, h − 4)`;
  - no leash, fog fully visible, no gate, no exit hint;
  - `cleared` = every monster dead, as today.
- **Who uses `'open'`:** the Training Grounds, `tests/fixtures/arena.ts`, and every caller that doesn't ask for `'generated'`.
- **`'generated'`:** only `beginFloor` (`delve/dive.ts`) passes it for dives.

**Generator:** `generateFloor(registry, seed, depth, biome, door): FloorMap` (`arpg/layout/generate.ts`).
- **Determinism:** pure and deterministic, on a new **`layout` fork** of the floor seed. `fork()` doesn't advance its parent, so the existing stream forks (`spawn`, `combat`, `loot`, `runes`, `materials`) are unchanged. Draws *within* `spawn` change because placement moves (S4).
- **The coarse grid:**
  - rooms sit in cells of `layout.coarseCell` (16) units, on a `layout.coarseCols × coarseRows` grid (4 × 4);
  - `layout.rooms { base 5, perDepth 0.1, max 8 }` rooms are placed by random walk from the start cell;
  - the graph is a spanning tree plus `layout.loops` (1–2) extra adjacent links.
- **Halls:** `hallWidth` (3) cells wide, L-shaped between the facing walls' midpoints. Doors are the hall's cells where it meets a room's wall.
- **Walls:** `layout.minWall` (2) cells thick between rooms and halls, so melee can't reach through.
- **Start and exit:** the start room is the walk's first room. The exit is the room farthest from it by graph distance (BFS), tie-break by seed. On boss floors the exit room is the boss room (`layouts.json → boss` template).
- **Kinds:**
  - start (no monsters);
  - exit;
  - boss on boss floors;
  - the rest drawn from `layout.kindWeights` by depth band;
  - at most `alcoveMax` (1) alcove;
  - vaults and sanctums weighted toward dead ends by `deadEndWeight`;
  - at least `minCombatRooms` combat rooms.
- **Room sizes:** from `layouts.json` templates per biome (8 × 8 up to 14 × 12; pillar and rubble masks at `pillarChance`). `maxSize` is `coarseCell × coarseCols` (64).
- **Packs:**
  - today's count (`packsBase + depth × packsPerDepth`, capped at `packsMax`, × the door's `packs`) is spread **over the combat rooms and dens** at up to `layout.packsPerRoom` (2) each;
  - if they don't fit, more combat rooms are added (up to `rooms.max`), then the remainder goes 1 per room round-robin;
  - boss floors: the boss alone in the boss room, its 2 packs in combat rooms on the way;
  - the exit, start, vault (unless guarded), sanctum and alcove rooms hold no packs;
  - spawns sit on walkable cells, at least `layout.minPackDistance` (moved here from `arena`) from the start.
- **Monster fields:** each monster gets a `roomId`. Boss adds inherit the boss's room.
- **Home fields:** each room's `homeField` (a BFS distance field to its centre, for leashing) is computed at generation.

**The world:** `ArpgWorld.map: FloorMap`. `world.width` and `height` come from the map.

## Movement and combat on the grid

**Collision:** `moveCircle(map, pos, radius, dx, dy) → pos` (`arpg/grid.ts`) slides a circle along walls, axis-separated, with sub-steps no longer than the radius so nothing tunnels. Closed doors are walls. Every mover goes through it:
- the hero's walk (step.ts) and the separation push (step.ts);
- the dodge (`dodge.ts`, changed from an absolute position to per-tick deltas);
- the pushes (`action.ts`: lunges, leaps, step-ins, recoils), each stopping at a wall;
- `moveMonster` and knockback (step.ts);
- `pull` (`impact.ts`), which can't drag through walls;
- boss adds' spawn;
- drop spawns, snapped to the nearest walkable cell (`combat.ts` items, motes, Siphon, Seedling; `material-drops.ts`; `rune-drops.ts`);
- the drop magnet and vacuum.

**Blink** (`forms.ts`) lands on the **last walkable point before the first blocked cell** along its line.

**Line of sight:** `lineOfSight(map, a, b)` (`arpg/grid.ts`) is a DDA raycast. It applies at every hit site:
- **Projectiles:** they stop at walls. A Bolt (and a shot's Split) bursts at the wall. A projectile's spawn point is checked first; one inside a wall spawns at the hero.
- **Beams:** Lance beams (`forms.ts`) end at the first wall.
- **Area hits:** need LOS from their centre:
  - `impact.ts` (AoE, explode, Nova, zones and Linger ticks, scatter);
  - `forms.ts` (Strike's arc, Blink's trail);
  - `basic.ts` (the melee arc, a ranged blow's landing check, `burstShot`, blow Linger ticks in `step.ts`).
- **Reaction splash:** `combat.ts nearby()`, the one choke point for Overload, Combust, Blight, Crystallize and Blackout, gets LOS. So do Fire mastery's spread and the Hellfire Brand blast.
- **Chains:** `chainJumps` (`impact.ts`) and Volley's homing and target list (`step.ts`, `forms.ts`) need LOS.
- **Targeting:**
  - `nearestMonster`, `bestCluster` (`targeting.ts`), `foeAhead` and `aimAt` (`basic.ts`) prefer visible foes;
  - an explicit aim point (`aimPoint`) is clipped to the hero's line of sight, so a placed form (Barrage, Maelstrom, Burst) can't land in an unseen room. Lobs don't pass over walls. Barrage's scattered impacts are each snapped to a walkable cell the clipped aim point can see.
- **Monsters:**
  - melee hits need LOS (`step.ts`);
  - a ranged foe fires only with LOS;
  - the boss slam and ring respect walls.

**Monsters:**
- **Waking:** on sight (LOS within `monster.aggroRadius`, unchanged home) or when hit; the pack wakes with it.
- **Pathing:** `flowField(map, target, radius, clearance)` is a BFS over walkable cells. The world keeps **two** fields toward the hero, one per **clearance class**: `small`, and `large` for big foes (clearance `ceil(2 × radius)` cells, at most `hallWidth`). Bosses never leave the boss room (they path within it only). Each is rebuilt when `world.t` passes the next `ai.flowEvery` (0.25 s) mark, within `ai.flowRadius` (30 cells).
  - **Steering:** monsters step down their class's gradient, or steer directly once they have LOS and are within `ai.directRange` (4).
  - **Out of range:** beyond the field they hold position (or go home if leashing).
  - **Ranged foes** path until they have LOS, then keep their spacing.
  - **Chargers'** dashes stop at walls.
- **Leash:**
  - **Trigger:** a monster farther than `ai.leashRadius` from its room's centre for more than `ai.leashSeconds` turns home along its room's `homeField`.
  - **On arrival:** it heals to full and sleeps again (`aggro` and `aggroAt` reset, so a boss's enrage timer restarts).
  - **Hit on the way:** a monster walking home that is hit turns back, its leash counted afresh.
  - **Open layout:** there is no leash.
- **Spatial hash:** a uniform-grid spatial hash (`arpg/spatial.ts`) replaces all-pairs separation and linear nearest-foe scans.

**Sealed rooms** (dens and the boss room):
- **When:** a room seals when the hero is inside it and any of its monsters is awake (woken from the doorway counts).
- **Before closing:**
  - room monsters outside the room are moved to free cells inside it;
  - each door closes only when no circle overlaps its cells (the hero is nudged inward); after `ai.sealGrace` (0.5 s), anything still overlapping is pushed out to the nearest free cell on its side, then the door closes.
- **Unsealing:** when no living monster with that `roomId` remains.
- **While sealed,** nothing passes its doors.
- **Events:** `seal` and `unseal`.

**Loot:**
- Drops land on walkable cells.
- When a room's last monster (by `roomId`) dies, the drops of monsters from that room are pulled to the hero (`ai.roomVacuum`). Both the vacuum and the `roomCleared` event live in one place, `onMonsterKilled` (B3). Room membership is set at spawn on the drop.
- Halls have no room, and their drops only magnet.
- The `vacuum: world.cleared` spawn flags change to the room rule.
- Drops left on the floor when the exit is taken are lost.
- A `roomCleared` event fires.

## Interacting, special rooms and the exit

**`interact`:**
- **Bindings:** a new control action, pad **A** and keyboard **C** by default. When a player's saved setup already uses A or C, `interact` is left unbound and the Controls editor flags it, rather than clashing silently.
- **Input:** `ArpgInput.interact` is a one-shot press, queued like `potion`; the bot sends the same press.
- **Recording uses:** every use is recorded in the sim as `world.pending.used` (interactable ids) and `world.pending.diveBuffs`. `bankWorld` writes them into `DiveState.used` / `diveBuffs` in the same bank that writes the hero's potions, so a reload never finds a used interactable unused (test: refill, bank, reload → the shrine is spent).
- **Engine:**
  - `interactTick` finds the nearest unused interactable within `ai.interactRadius` and emits `interactPrompt { id, kind, text }` while one is in range;
  - an interact press acts on it.

**Treasure vault (chest):**
- Opening it bursts `drops.vault`: flux, higher-tier shards, sometimes an essence, scaled by depth and the door; no gear.
- Its id goes into `DiveState.used`, so a replay finds it open.
- A vault may hold a guard pack (`layout.vaultGuardChance`).

**Elite den:** 1–2 elite-led packs. `drops.den.gearBonus` is added to their elite gear chance, guarded by `dropsGiven` like any gear. It seals.

**Shrine (sanctum room):**
- **Using it:** a press starts a channel of `ai.shrineChannel` (0.5 s) that completes unless the hero moves, dodges or is hit (no holding needed).
- **Buff:** drawn from `shrines.json` at generation, on `layout`. Its name and effect show in the prompt.
- **Applying it:** `applyShrine(world, shrine)`, in the sim (no profile needed); it records the use as above.
  - Floor buffs go on `HeroEntity.floorBuffs` (damage multiplier, HP regen, mana regen); `hero.stats` becomes `applyBuffs(hero.baseStats, floorBuffs)`, and the mana pool is resized in place. No chain re-resolve is needed.
  - Find is added to `world.loot.find`.
  - A potion refill sets `hero.potions` to the max.
  - Dive buffs go to `world.pending.diveBuffs` → `DiveState.diveBuffs`, and are applied when each floor's world is built.
- **Stats:** a pure `applyBuffs(stats: HeroStats, buffs): HeroStats` applies buffs over final stats. `HeroEntity.baseStats` keeps the stats before floor buffs. `createHeroEntity` and `refreshWorldHero` take the gear's stats (`profileStats`) and put the dive's and then the floor's blessings back on (`applyBuffs`), so a profile change mid-floor (a bank, the alcove) never wipes the buffs. In the sim, `applyShrine` uses `applyBuffs` directly (no profile).
- **One use per dive** (`DiveState.used`).

**Anvil alcove:**
- **Opening it** emits `alcoveOpen { id }`.
- **Offers:** `alcoveOffers(registry, profile, world, id)` computes 2–3 offers from `stopKinds` (they need the profile: what the hero can take and pay for), rolled on `alcove:<depth>:<roomId>`, so the same alcove offers the same kinds if reopened. The client and the bot call it on `alcoveOpen`. Offers are `StopKind[]`, as in `DiveStop.offers`.
- **Taking one:** `takeAlcove(registry, profile, world, action)` (`delve/stops.ts`).
  - Valid while the dive is `'fighting'`.
  - It banks the world first, then runs the op with the lock lifted, like `takeStop`. Payment comes from `dive.banked` and `dive.haul`, then the stockpile.
  - It marks the alcove used (in `DiveState.used` and on the world's interactable) and calls `refreshWorldHero` with `profileStats` (the blessings go back on there).
- **Pausing:** the client pauses the arena while the dialog is open; the bot calls `takeAlcove` directly.
- **One use per dive.**

**Exit gate:**
- An interact on the gate emits `exitRequest { roomsUnexplored }`.
- **The client** pauses and confirms ("Leave the floor? n rooms unexplored"), then calls `exitFloor(world)`. **The bot** calls `exitFloor` directly.
- `exitFloor` sets `world.exited`; `checkEnd` (client) and `playFloor` (autopilot) end the floor on it → `completeFloor` → the stop.
- On a boss floor the gate is closed until the boss is dead.
- Monsters left alive stay behind.
- **For generated floors,** `world.cleared` is replaced by `world.exited`. The `cleared` event and `world.cleared` remain for the open layout.
- `clearFloor` fires on exit with `roomsCleared`; `noPotion` / `noDamage` cover the whole floor.

**Quests:**
- Kill and boss events are unchanged.
- **Rooms cleared:** a room counts as cleared only if it spawned monsters and all of them died. Start, vault (unguarded), sanctum, alcove and exit rooms never count.
- **The threshold** lives in the quest data: the `clearFloor` objective filter gains `minRoomsCleared`, which the `clearFloor` event's `roomsCleared` must meet. The flag contract templates and Untouchable set it (S3).

**HUD count:** "Rooms explored n / m" counts revealed rooms.

## Fog of war and the minimap

**Fog:** `ArpgWorld.fog: Uint8Array` (0 unseen, 1 seen, 2 visible now) and `fogVersion`.
- **Update:** `fogTick` runs when `world.t` passes the next `ai.fogEvery` (0.1 s) mark. Cells within `ai.sightRadius` with LOS from the hero become visible, and entering a room reveals it whole.
- **Open layout:** fully visible.

**Exit hint:** if the exit room isn't revealed after `ai.exitHintSeconds` (60), an `exitHint` event fires and the minimap shows a compass arrow toward it.

**`hudMapOf(world)`** (engine, pure) builds:
- the revealed room outlines and their icons (chest, shrine, anvil, a skull for a den, the gate);
- the exit and hint;
- foes where currently visible, and drops in revealed cells;
- `fogVersion`.

The client redraws the minimap's fog layer only when `fogVersion` changes; the fog bytes are read from the world, not copied into every snapshot.

## Rendering (the client)

**Pixel floor** (`features/delve/arena/pixel/`):
- **Generated from the `FloorMap`:**
  - walls become the biome's cliffs or stone;
  - halls become worn paths;
  - rooms get biome dressing: rivers and pools through rooms, foliage, stone plazas in arenas, pillars as rock.
- **Seeded** from the **floor seed**.
- **Simulates only active chunks** near the view; far chunks sleep, so cost doesn't grow with map area.

**Doors:** pixel frames that close and glow while sealed.

**Props** (code sprites in `packages/pixel-forge`):
- `chest` (closed and open), `shrine` (lit and spent), `alcove_anvil`, `exit_gate` (closed and open).
- `sprite-atlas.test.ts` gets a props size rule: 16 px per unit of the prop's `size` in `layouts.json → props`.

**Overlays:**
- **Fog layer:** a stepped darkness overlay (unseen black, seen-not-visible dimmed). Foes are drawn only where visible.
- **Interact plaques:** they use the device's glyph (e.g. "C Open", "A Pray").

**Dialogs:** the exit confirm is a kit dialog, and the alcove dialog reuses `StopPanel`'s cards.

**Camera:** the same zoom, clamped to the map's bounds.

**Training Grounds:** unchanged (the open room).

## Data and tuning

- **`balance.json → delve.layout`:**
  - the grid: `coarseCell`, `coarseCols`, `coarseRows`, `rooms { base, perDepth, max }`, `hallWidth`, `minWall`, `loops`;
  - room kinds: `kindWeights` by depth band, `alcoveMax`, `deadEndWeight`, `minCombatRooms`, `vaultGuardChance`;
  - placement: `pillarChance`, `minPackDistance` (moved from `arena`), `packsPerRoom`;
- **`balance.json → delve.ai`:** `flowEvery`, `flowRadius`, `directRange`, `leashRadius`, `leashSeconds`, `sealGrace`, `roomVacuum`, `sightRadius`, `fogEvery`, `exitHintSeconds`, `interactRadius`, `shrineChannel`. `monster.aggroRadius` stays where it is.
- **`balance.json → delve.drops`:** `vault` (a drop entry table without gear), `den { gearBonus }`.
- **`src/data/layouts.json`** (`LayoutsDataSchema`): room templates per biome (sizes, pillar and rubble masks), the boss template, `props` sizes.
- **`src/data/shrines.json`** (`ShrinesDataSchema`): id, name, text, effect knobs, duration `floor | dive`, weight.
- **Pacing:** `maxFloorSeconds`, the autopilot's code default (autopilot.ts), rises to 420.

## The autopilot and pacing

**The bot** (`arpg/bot.ts`, `delve/autopilot.ts`):
- **Movement:** it moves by flow field toward its target: the nearest visible or reachable awake foe, loot, an interactable, or the exit.
- **Policies:**
  - **thorough** (default): visit rooms by path distance; clear combat rooms and dens; open vaults; use sanctums and alcoves (`takeAlcove`); then `exitFloor`;
  - **beeline:** head for the exit, fighting what blocks it.

**The pacing rails:**
- **Floor-time bands:** beeline averages 45–90 s, full clear 120–180 s (in the test).
- **Re-measured:** the depth targets and the seeds pinned in tests (delve-banking's "seed 8 drops gear" and E2E D02; the bank-timing loop, now ending on `exited`).
- **Rushing:** a beeline run must reach at least `x` % of the thorough run's depth.
- **Runtime:** the suites' sim time rises; budget it, cutting seeds or dives where the rails allow.
- **Economy:** materials per floor, vault payouts and room counts are tuned with the Economy view, so the crafting and quest targets still hold.

## Testing

- **Generator:**
  - every room is reachable from the start, and the exit is reachable;
  - counts, sizes and kinds stay in range per depth;
  - packs fit (overflow rules) and boss floors are laid out right;
  - sealed rooms have doors, and walls are at least 2 thick;
  - nothing spawns or sits inside a wall;
  - the same seed gives the same map.
- **Grid physics:**
  - `moveCircle` slides along walls, never tunnels, and never ends inside a wall;
  - every listed mover and hit site respects walls and LOS;
  - Blink stops before walls, and aim points are clipped;
  - melee doesn't reach through walls;
  - flow-field pathing works for both clearance classes;
  - leash, heal and sleep work;
  - sealing works, including monsters outside and doors with someone in them;
  - the room vacuum works.
- **Interactions:**
  - the vault's drops, and its replay (still open);
  - shrine buffs (floor and dive) and the channel cancel;
  - the alcove's one op, and its replay (still used);
  - the exit (request, `exitFloor`, the boss gate, `clearFloor` with `roomsCleared`, monsters left behind).
- **Fog:** reveal by sight and by room; `fogVersion`; the exit hint.
- **The open layout:** the fixture suites run on `openRoom` with `cleared` semantics unchanged.
- **Determinism:**
  - a seeded generated floor reproduces exactly;
  - bank-timing invariance holds on generated floors;
  - flow and fog run on `world.t` marks, not on frames.
- **Client:**
  - the minimap from fog and icons;
  - plaques and prompts per device;
  - the exit confirm and the alcove dialog;
  - the fog layer;
  - the pixel floor built from a map;
  - the camera clamp.
- **E2E:**
  - dives with the autopilot, with longer per-floor timeouts;
  - opening a vault and taking the exit;
  - the responsive probes cover the dialogs.

## Phases and parallel areas

| Phase | Area | Owns |
|---|---|---|
| **A · Contract** | One area | <ul><li>**Types:** `types/floor-map.ts`; new fields with initialisers on `ArpgWorld` (`map`, `fog`, `fogVersion`, `exited`, flow fields), `MonsterEntity.roomId`, `Drop.roomId`, `HeroEntity.floorBuffs`, `WorldPending.used` / `diveBuffs`, `DiveState.used` / `diveBuffs` (save v10 + reset), `HeroEntity.baseStats` and `applyBuffs` (implemented); `FloorOptions.layout` / `used` / `diveBuffs` and their pass-through in `beginFloor` (so B1 and B3 never edit `beginFloor`).</li><li>**Inputs and events:** `ArpgInput.interact`; the events (`interactPrompt`, `exitRequest`, `alcoveOpen`, `seal`, `unseal`, `roomCleared`, `exitHint`).</li><li>**Data:** all blocks and schemas with starter content.</li><li>**Grid core, implemented:** `arpg/grid.ts` (`moveCircle`, `lineOfSight`, walkable / snap helpers) and `openRoom` with `FloorOptions.layout` (default open). Every rectangle clamp is swapped for the grid helpers (behaviour identical on `openRoom`; suites green).</li><li>**Typed stubs** in their owners' files: `generateFloor`, `flowField`, `flowTick`, `leashTick`, `sealTick`, `fogTick`, `interactTick`, `applyShrine`, `alcoveOffers`, `takeAlcove`, `exitFloor`, `hudMapOf`, `onMonsterKilled` (called from `killMonster`). `tick()` calls the tick stubs (no-ops on open).</li><li>**Controls:** the `interact` action with the no-clash rule.</li></ul> |
| **B · Engine** (B1, B2, B3 in parallel; B4 after) | **B1** generator | `arpg/layout/*`; `arpg/world.ts` (spawning per room, `roomId`, home fields, the generated path) |
| | **B2** physics and AI | LOS at every hit site (`impact.ts`, `forms.ts`, `targeting.ts`, `basic.ts`, `combat.ts nearby()` / mastery / Brand, projectiles and monster attacks in `step.ts`); `arpg/flow.ts` (`flowField`, `flowTick`, `leashTick`); monster movement in `step.ts`; `arpg/spatial.ts`; drops' `roomId` and walkable snapping at their spawn sites (`combat.ts` / `material-drops.ts` / `rune-drops.ts`) |
| | **B3** floor flow | `arpg/interact.ts` (`interactTick`, chest, `applyShrine`, gate, `exitFloor`, `onMonsterKilled` with the room vacuum and `roomCleared`); `delve/stops.ts` (`alcoveOffers`, `takeAlcove`); `arpg/seal.ts` (`sealTick`); `arpg/fog.ts` (`fogTick`, `hudMapOf`); `delve/dive.ts` (`completeFloor` on exit, `clearFloor` with `roomsCleared`, `DiveState.used` / `diveBuffs`); the quest / contract `minRoomsCleared` |
| | **B4** bot and pacing (after B1–B3) | `arpg/bot.ts` flow-field movement and both policies; `delve/autopilot.ts` (`playFloor` on `exited`, `maxFloorSeconds`); the pacing rails and pinned seeds; economy tuning |
| **C · Client** (parallel, after A; real maps after B) | **C1** rendering | The pixel floor from `FloorMap` (chunked, floor-seeded); walls, doors and props drawing; the fog layer; the camera clamp (`ArenaRenderer.ts`, `pixel/*`) |
| | **C2** HUD, dialogs, flow | The snapshot (`useArenaCore.ts`: `hudMapOf`, prompts); `useArena.ts` (`checkEnd` on `exited`, the exit and alcove flows, pausing); `DelveRun.tsx`; the minimap; "Rooms explored n / m"; interact plaques; the exit confirm; the alcove dialog; buffs in the buff row; the exit hint |
| | **C3** props | `chest`, `shrine`, `alcove_anvil`, `exit_gate` code sprites (pixel-forge → atlas; the props size rule in `sprite-atlas.test.ts`) |
| **D · Balance, E2E, docs** | One area | Pacing and economy tuning with the Economy view; E2E; CLAUDE.md; bump **v0.60.0** |

**Shared files:**
- B1 owns `world.ts` and B2 owns `step.ts`'s movement and attack code; B3 touches neither (its ticks live in its own files, called from Phase A's `tick()` hooks).
- B2 and B3 both need `combat.ts` `killMonster`. B2 owns the file; B3's room-clear hook is a Phase A stub (`onMonsterKilled(world, m)` in `arpg/interact.ts`) that `killMonster` already calls.

## Out of scope

- Organic or cave-shaped rooms (the grid allows them later).
- Traps and environmental hazards.
- Keys and locked doors.
- New objective types for vaults or shrines.
- Bosses' new attack patterns (a separate feature).
- Saving a floor's mid-fight state across a reload (a reload replays the floor; used interactables and given gear stay used, S1).
