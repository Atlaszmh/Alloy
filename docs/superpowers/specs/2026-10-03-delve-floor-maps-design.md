# Delve floor maps (procedurally generated rooms and halls)

**Status:** design approved in conversation, 2026-10-03. Builds on v0.59.0 (quests, crafting, the v1 UI). Ships as **v0.60.0**. No save change is expected (the map is regenerated from the floor seed); if one is needed, the save version bumps and older saves reset (no migration).

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

## The map model

- **Grid:** a floor is a grid of 1-unit cells (`Cell = floor | wall | door`), at most `delve.layout.maxSize` per side.
- **`FloorMap`** (`src/types/floor-map.ts`):
  ```ts
  { width, height, cells: Uint8Array, rooms: Room[], doors: Door[], start: Vec, exit: Vec, seed }
  Room = { id, kind: RoomKind, rect, cells?, packs: number, sealed?: boolean, revealed: boolean, cleared: boolean, interactable?: Interactable }
  RoomKind = 'start' | 'combat' | 'den' | 'vault' | 'shrine' | 'alcove' | 'exit' | 'boss'
  Door = { x, y, rooms: [a, b], closed: boolean }
  Interactable = { kind: 'chest' | 'shrine' | 'alcove' | 'gate', x, y, used: boolean, shrine?: ShrineId }
  ```
- **Generator:** `generateFloor(registry, seed, depth, biome, door): FloorMap`. It is pure and deterministic, on a new **`layout` fork** of the floor seed (so every existing stream is unchanged).
  - **Rooms:** 5–8, by `delve.layout.rooms` and depth, placed on a coarse grid graph.
  - **Connections:** a spanning tree plus `loops` (1–2) extra links. Halls are `hallWidth` (3) cells wide.
  - **Room sizes and shapes:** from `layouts.json` templates per biome (small 8 × 8 to an arena of 14 × 12; pillar and rubble patterns for cover).
- **Kinds:**
  - the start and exit rooms are far apart (graph distance), with no monsters in the start room;
  - on boss floors the exit room is the boss room;
  - the rest are drawn from `kindWeights` by depth (combat most; den, vault, shrine, alcove by chance; at most one alcove; vaults and shrines prefer dead ends).
- **Packs:** today's pack count (`packsBase + depth × packsPerDepth`, × the door's `packs`) is **spread across the combat rooms and dens** (1–2 per room) instead of one field. Elites, traits and boss rules are unchanged. Spawns are only on walkable cells, at `minPackDistance` from the start.
- **The world:** `ArpgWorld.map: FloorMap`. `world.width` / `height` come from the map.
- **The open-room layout:** `openRoom(width, height)`, one room the size of today's arena, is used by the **Training Grounds** and by the existing test fixtures. Everything that worked on the rectangle behaves the same on it.

## Movement and combat on the grid

**Collision:**
- `moveCircle(map, pos, radius, dx, dy) → pos` slides a circle along walls (axis-separated).
- It **replaces the ~15 ad hoc rectangle clamps**. Every mover goes through it:
  - walking, the dodge dash, and the pushes (lunges, leaps, step-ins, recoils), each stopping at a wall;
  - Blink, which lands on the farthest walkable point along its line;
  - knockback, and monster separation.
- Closed doors are walls.

**Line of sight:** `lineOfSight(map, a, b)` is a grid raycast (DDA). It applies to:
- projectiles: they stop at walls; a burst form (Bolt, Burst, a shot's Split) bursts at the wall;
- beams (Lance): they end at the first wall;
- area hits (blasts, zones, auras, Nova, explode), Overload / Combust splash and chain jumps: they hit only targets visible from their centre or source;
- auto-aim (`nearestMonster`) and the bot's targeting: they prefer visible foes;
- aim points, barrage and scatter impacts: they snap to walkable cells;
- monster shots and the boss ring: the same rules.

**Monsters:**
- **Waking:** a monster wakes on sight (line of sight within `aggroRadius`) or when hit; its pack wakes with it.
- **Pathing:** `flowField(map, target, radius)` is a breadth-first distance field over walkable cells around the hero. The world keeps one, rebuilt every `ai.flowEvery` (0.25 s) within `ai.flowRadius` (30 cells), and monsters step down its gradient (direct steering once they have line of sight and are close).
  - Ranged foes path until they have line of sight, then keep their spacing.
  - Chargers' dashes stop at walls.
- **Leash:** a monster more than `ai.leashRadius` from its room's centre for more than `ai.leashSeconds` turns home (a flow field to its room) and heals to full on arrival.
- **Spatial hash:** a uniform-grid spatial hash replaces the all-pairs separation and linear nearest-foe scans.

**Sealed rooms:**
- A den or the boss room **seals** (its doors close) when the hero is inside and one of its monsters wakes.
- It **unseals** when that room's monsters are all dead.
- While sealed, nothing passes its doors.

**Loot:**
- Drops land on walkable cells.
- When a room's last monster dies, that room's drops are pulled to the hero (`ai.roomVacuum`). This replaces today's whole-floor vacuum on clear.
- Materials still magnet in within `magnetRadius`.
- Drops left on the floor when the exit is taken are lost.

## Interacting, special rooms and the exit

**`interact` action** (a new control in `CONTROL_ACTIONS`): pad **A** (free in combat), keyboard **C** (rebindable). A prompt plaque shows within `interactRadius` of an interactable.

**Treasure vault:** a chest. Interact to open it; it bursts `drops.vault` (flux, higher-tier shards, sometimes an essence; scaled by depth and the door). A vault may hold a guard pack (`vaultGuardChance`).

**Elite den:** 1–2 elite-led packs, `drops.den.gearBonus` added to the elite gear chance; it seals while you fight.

**Shrine:**
- Interact and hold for `shrineChannel` (0.5 s) to take its buff, drawn from `shrines.json` when the floor generates.
- Buffs include damage +x% for the floor, regen, Find +x for the floor, a potion refilled, or mana.
- Its name and effect show in the prompt before use. One use.
- Floor buffs live on `HeroEntity.floorBuffs` and appear in the HUD's buff row.

**Anvil alcove:**
- Interact to open the stop's power-up picker: 2–3 offers from `stopKinds`, rolled on `alcove:<depth>`, taken with `takeStop`'s lock lifted for that one op.
- The arena pauses while it's open. One use.

**Exit gate:**
- Interact, then confirm ("Leave the floor? n rooms unexplored"). The floor ends: `completeFloor` → the stop.
- On a boss floor the gate stays closed until the boss is dead.
- `cleared` now means the gate was used.
- The floor's `clearFloor` quest event fires then, with `noPotion` / `noDamage` over the whole floor.
- Monsters left alive stay behind.

**Quests:** kill and boss events are unchanged. `clearFloor` fires on the exit. New objective types (e.g. "open vaults") are out of scope but cheap to add.

## Fog of war and the minimap

**Fog:**
- `ArpgWorld.fog: Uint8Array` (0 unseen, 1 seen, 2 visible now), updated at `fogEvery` (0.1 s).
- Cells within `sightRadius` with line of sight from the hero become visible.
- Entering a room reveals the whole room (`Room.revealed`).
- **Exit hint:** if the exit room isn't revealed after `exitHintSeconds` (60), the minimap shows a compass arrow toward it.

**`HudMap`** carries:
- the revealed cells (or a revealed-room list plus hall cells);
- room outlines and icons for revealed special rooms (chest, shrine, anvil, a skull for a den, the gate);
- the exit (once revealed) and the hint arrow;
- foes only where currently visible, and drops in revealed cells.

The floor panel shows "Rooms n / m" in place of "foes left".

## Rendering (the client)

**Pixel floor** (`features/delve/arena/pixel/`):
- Generated from the `FloorMap`:
  - walls become the biome's cliffs or stone;
  - halls become worn paths;
  - rooms get biome dressing (rivers and pools through rooms, foliage, stone plazas in arenas, pillars as rock).
- Seeded from the **floor seed** (today: depth × 7919 + biome, so floors repeat).
- **Simulates only active chunks** near the view (chunked grid, far chunks asleep), so cost doesn't grow with map area. It still runs in the worker.

**Doors** are pixel frames that close and glow while sealed.

**Props** (code sprites in `packages/pixel-forge`, built into the atlas): `chest` (closed and open), `shrine` (lit and spent), `alcove_anvil`, `exit_gate` (closed and open).

**Fog layer:** a stepped darkness overlay on the ground layer (unseen black, seen-not-visible dimmed). Foes are drawn only where visible.

**Interact plaques** use the device's glyph (e.g. "C Open", "A Pray").

**Exit confirm** is a small kit dialog. **The alcove picker** reuses `StopPanel`'s cards in a kit dialog.

**Camera:** the same zoom, clamped to the map's bounds.

**Training Grounds:** unchanged (the open room).

## Data and tuning

- **`balance.json → delve.layout`:** `maxSize`, `rooms { base, perDepth, max }`, `hallWidth`, `loops`, `kindWeights` by depth band, `alcoveMax`, `vaultGuardChance`, `pillarChance`, `minPackDistance`, `packsPerRoom`.
- **`balance.json → delve.ai`:** `aggroRadius` (moved), `flowEvery`, `flowRadius`, `leashRadius`, `leashSeconds`, `roomVacuum`, `sightRadius`, `fogEvery`, `exitHintSeconds`, `interactRadius`, `shrineChannel`.
- **`balance.json → delve.drops`:** `vault` (a drop entry table like the elite's), `den { gearBonus }`.
- **`src/data/layouts.json`** (new, `LayoutsDataSchema`): room templates per biome (sizes, pillar and rubble masks).
- **`src/data/shrines.json`** (new, `ShrinesDataSchema`): shrine buffs (id, name, text, effect knobs, duration `floor | dive`, weight).
- Every number is data; the registry checks cross-file references (biomes, stop kinds).

## The autopilot and pacing

**The bot** (`arpg/bot.ts`, `delve/autopilot.ts`):
- **Movement:** it moves by flow field, toward its target (the nearest visible or reachable awake foe), loot, an interactable, or the exit.
- **Policies:**
  - **thorough** (the default): it visits rooms in order of path distance, clears combat rooms and dens, opens vaults, uses shrines and alcoves, then takes the exit;
  - **beeline**: it heads for the exit, fighting only what blocks it.

**The pacing rails** (`tests/delve-pacing.test.ts`):
- The "8–60 s per floor" band becomes **beeline 45–90 s and full clear 120–180 s** (averages; data in the test).
- The depth targets are re-measured with the thorough policy.
- A beeline run checks rushing is viable (it reaches at least `x` % of the thorough run's depth).
- The economy (materials per floor, vault payouts, room counts) is tuned with the Economy view so the crafting and quest targets still hold.

## Testing

- **Generator:**
  - every room is reachable from the start, and the exit is reachable;
  - room counts, sizes and kinds stay in range per depth;
  - sealed rooms have doors;
  - no spawn or interactable sits in a wall;
  - the same seed gives the same map;
  - existing streams are unchanged (a floor's monsters roll the same as before, given the same pack count).
- **Grid physics:**
  - `moveCircle` slides along walls and never ends inside one;
  - every mover respects walls;
  - `lineOfSight` blocks shots, beams, area hits and chains;
  - flow-field pathing goes around walls; leashing and healing work;
  - sealing and unsealing work;
  - the room vacuum works.
- **Interactions:** the vault's drops, shrine buffs (floor-scoped), the alcove's one op, and the exit (confirm, boss gate, `clearFloor` flags, monsters left behind).
- **Fog:** reveal by sight and by room; the exit hint timing.
- **The 31 fixture-based test files** run on `openRoom` unchanged.
- **Determinism:** a seeded floor reproduces exactly; bank-timing invariance still holds.
- **Client:**
  - the minimap from fog and icons;
  - plaques and prompts per device;
  - the exit confirm and the alcove dialog;
  - fog rendering;
  - the pixel floor built from a map (a map-to-cells test);
  - the camera clamp.
- **E2E:** a dive plays floors with the autopilot (longer per-floor timeouts); a test opens a vault and takes the exit; the responsive probes cover the new dialogs.

## Phases and parallel areas

| Phase | Area | Owns |
|---|---|---|
| **A · Contract** | One area | <ul><li>`types/floor-map.ts`;</li><li>the data blocks and schemas (`delve.layout`, `delve.ai`, `drops.vault` / `den`, `layouts.json`, `shrines.json` with starter content);</li><li>`ArpgWorld.map` and `fog`;</li><li>`openRoom`;</li><li>**`moveCircle` and `lineOfSight` implemented** and swapped in for every rectangle clamp (behaviour unchanged on `openRoom`; the suites stay green);</li><li>`createFloorWorld` building `openRoom` until B1;</li><li>typed stubs for `generateFloor`, `flowField`, and the interaction and fog functions;</li><li>the `interact` control action;</li><li>`HudMap` fields.</li></ul> |
| **B · Engine** (B1, B2, B3 in parallel; B4 after) | **B1** generator | `arpg/layout/*` (`generateFloor`, templates, kinds, pack and interactable placement); `createFloorWorld` switched to it for dives |
| | **B2** physics and AI | Line of sight at every hit site (`impact.ts`, `forms.ts`, `targeting.ts`, projectiles in `step.ts`); `flowField` and monster pathing, aggro, leash; sealing; the spatial hash; the room vacuum |
| | **B3** floor flow | Interactions (`arpg/interact.ts`: chest, shrine and floor buffs, alcove via `takeStop`, the exit gate); `cleared` = the gate; `completeFloor` and quest `clearFloor`; fog (`arpg/fog.ts`); `HudMap` building in the snapshot |
| | **B4** bot and pacing (after B1–B3) | `arpg/bot.ts` flow-field movement and both policies; `delve/autopilot.ts`; the pacing rails and economy tuning |
| **C · Client** (parallel, after A; real maps after B) | **C1** rendering | The pixel floor from `FloorMap` (chunked sim, floor-seeded); walls and doors; the fog layer; the camera clamp |
| | **C2** HUD and dialogs | The minimap from fog and icons; "Rooms n / m"; interact plaques and prompts; the exit confirm; the alcove dialog; shrine buffs in the buff row; the exit hint |
| | **C3** props | `chest`, `shrine`, `alcove_anvil`, `exit_gate` code sprites (pixel-forge → atlas; `sprite-atlas.test.ts`) |
| **D · Balance, E2E, docs** | One area | Pacing and economy tuning with the Economy view; E2E; CLAUDE.md; bump **v0.60.0** |

## Out of scope

- Organic or cave-shaped rooms (the grid allows them later).
- Traps and environmental hazards.
- Keys and locked doors.
- New objective types for vaults or shrines.
- Bosses' new attack patterns (a separate feature).
- Saving a floor's state across a reload beyond what's saved today (a reload replays the floor from its seed).
