import type { DropKind, MonsterKind, Vec } from './arpg.js';

// Delve floor maps (see the floor maps spec): the grid, its rooms and doors,
// what can be used in them, the shrines' blessings, the data and the HUD's map.

/**
 * A grid cell (see the room objects spec): 0 floor, 1 wall, 2 door (solid while
 * its door is shut), 3 cover, 4 crumbling cover, 5 foliage, 6 slow ground.
 */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The cell codes by name. */
export const CELL = {
  floor: 0,
  wall: 1,
  door: 2,
  cover: 3,
  crumbling: 4,
  foliage: 5,
  slow: 6,
} as const;

/**
 * What a cell is drawn as (`FloorMap.look`, for the client only): its index in
 * this list. `plain` (0) is the cell's own default (a floor's ground, a wall's
 * stone); the rest are the biome palettes' cover, crumbling cover, foliage and
 * slow ground (`setpieces.json → palettes`), and `rubble`, what a crumbled
 * structure leaves.
 */
export const LOOK_IDS = [
  'plain',
  'ruin',
  'timber',
  'minecart',
  'ice_pillar',
  'machinery',
  'boulder',
  'tomb',
  'statue',
  'spire',
  'cracked_wall',
  'vines',
  'undergrowth',
  'coal_rubble',
  'snowdrift',
  'oil',
  'shallow_water',
  'mud',
  'ash',
  'rubble',
] as const;
export type LookId = (typeof LOOK_IDS)[number];

/** A crumbling structure: its cells (code 4), and its life (see the room objects spec). */
export interface Structure {
  id: number;
  cells: Vec[];
  life: number;
  maxLife: number;
}

/** A rectangle of cells: its top-left cell and its size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RoomKind =
  | 'start'
  | 'combat'
  | 'den'
  | 'vault'
  | 'sanctum'
  | 'alcove'
  | 'exit'
  | 'boss';

/** The kinds a generated room draws from `layout.kindWeights` (the rest are placed). */
export const DRAWN_ROOM_KINDS = ['combat', 'den', 'vault', 'sanctum', 'alcove'] as const;
export type DrawnRoomKind = (typeof DRAWN_ROOM_KINDS)[number];

export type InteractableKind = 'chest' | 'shrine' | 'alcove' | 'gate';

/** A shrine's id in `shrines.json`. */
export type ShrineId = string;

/** Something in a room the hero uses with `interact`. */
export interface Interactable {
  /** `${depth}:${roomId}`: one use a dive (`DiveState.used`). */
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  used: boolean;
  /** A shrine's blessing, drawn at generation. */
  shrine?: ShrineId;
}

export interface Room {
  id: number;
  kind: RoomKind;
  /** Its floor, in cells (its walls are outside it). */
  rect: Rect;
  /** Its template's dressing over `rect`, row by row (0 floor, 1 pillar, 2 rubble); `cells` holds it as walls. */
  mask?: Uint8Array;
  /** BFS steps from each map cell to its centre, for a leashed foe going home (65535: unreachable). */
  homeField?: Uint16Array;
  revealed: boolean;
  cleared: boolean;
  sealed: boolean;
  interactable?: Interactable;
}

export interface Door {
  id: number;
  /** Its cells (`Cell` 2), where a hall meets a room's wall. */
  cells: Vec[];
  rooms: [number, number];
  /** Closed by a seal (`seal.ts` opens it again). */
  closed: boolean;
  /**
   * Held shut by the guided start's gate (see the tutorial spec), whatever the
   * seal does: only the tutorial lets it go. `doorShut` reads both.
   */
  held?: boolean;
}

export interface FloorMap {
  width: number;
  height: number;
  /** `Cell`s, row by row (`y * width + x`). */
  cells: Uint8Array;
  /** Each cell's look (`LOOK_IDS` index), row by row: what the client draws it as. */
  look: Uint8Array;
  /** The crumbling structures (their cells are code 4 until they crumble to slow ground). */
  structures: Structure[];
  /**
   * Bumped whenever a cell changes (a crumble) or a door opens or shuts: what
   * caches the map's cells or doors (the fog's sight, the bot's paths, the
   * client's layers) keys on it.
   */
  version: number;
  rooms: Room[];
  doors: Door[];
  /** Where the hero starts. */
  start: Vec;
  /** The exit gate (the open room has none: its start). */
  exit: Vec;
  /** Today's one open room (`openRoom`): no leash, no fog, no gate; it clears when every foe is dead. */
  open: boolean;
}

/** Which map a floor gets: `'open'` (the default) or a generated one (dives; see `FloorOptions.layout`). */
export type FloorLayout = 'open' | 'generated';

// ── Shrines (shrines.json) ─────────────────────────────────────────────────

/** What a shrine's blessing does; each part is optional. */
export interface ShrineEffect {
  /** Damage dealt × (1 + this). */
  damage?: number;
  /** Life regained a second, as a fraction of max life. */
  lifeRegen?: number;
  /** Mana regen × (1 + this). */
  manaRegen?: number;
  /** Find, in percentage points (`world.loot.find`). */
  find?: number;
  /** Refills the potions (at once: a floor shrine only). */
  potions?: true;
}

export interface ShrineDef {
  id: ShrineId;
  name: string;
  /** Player-facing: what it does, for the prompt. */
  text: string;
  effect: ShrineEffect;
  /** How long it lasts: the floor, or the rest of the dive. */
  duration: 'floor' | 'dive';
  /** Its chance to be a sanctum's shrine, against the others'. */
  weight: number;
}

/** A blessing on the hero: its shrine (for its name) and what it does. */
export interface Buff {
  shrine: ShrineId;
  effect: ShrineEffect;
}

// ── Layouts (layouts.json) ─────────────────────────────────────────────────

export const PROP_IDS = ['chest', 'shrine', 'alcove_anvil', 'exit_gate'] as const;
export type PropId = (typeof PROP_IDS)[number];

/** A room's shape: its floor in cells, and the dressings one of which it may wear. */
export interface RoomTemplate {
  id: string;
  w: number;
  h: number;
  /** Each `h` rows of `w` characters: '.' floor, '#' a pillar, '%' rubble (both block). */
  masks: string[][];
}

export interface LayoutsData {
  /** Room templates by biome id; `default` serves a biome without its own. */
  rooms: Record<string, RoomTemplate[]>;
  /** The boss room. */
  boss: RoomTemplate;
  /** Each prop's size in units (its sprite is 16 px a unit). */
  props: Record<PropId, number>;
}

// ── Balance (balance.json → delve.layout, delve.ai) ────────────────────────

/** How a floor is generated (see the floor maps spec's "Generator"). */
export interface LayoutBalance {
  /** Rooms sit in coarse cells of this many units, on a `coarseCols` × `coarseRows` grid. */
  coarseCell: number;
  coarseCols: number;
  coarseRows: number;
  /** Rooms a floor: `base` + depth × `perDepth`, at most `max`. */
  rooms: { base: number; perDepth: number; max: number };
  /** A hall's width in cells. */
  hallWidth: number;
  /** The thinnest wall between rooms and halls, in cells. */
  minWall: number;
  /** Links past the spanning tree: from the first to the second. */
  loops: [number, number];
  /** The drawn kinds' weights by depth band, each from its `fromDepth` on (the first from 1). */
  kindWeights: { fromDepth: number; weights: Record<DrawnRoomKind, number> }[];
  /** Anvil alcoves a floor, at most. */
  alcoveMax: number;
  /** Vaults and sanctums weigh this much more in dead ends. */
  deadEndWeight: number;
  minCombatRooms: number;
  /** Chance a vault holds a guard pack. */
  vaultGuardChance: number;
  /** Chance a room wears one of its template's masks. */
  pillarChance: number;
  /** Packs spawn at least this far from the start. */
  minPackDistance: number;
  /** Packs a combat room or den, at most (before the overflow rules). */
  packsPerRoom: number;
  /** Dives play generated floors (`FloorOptions.layout: 'generated'`); off, they keep the open room. */
  generatedDives: boolean;
}

/** How foes move and see, and the floor's timings (see the floor maps spec). */
export interface AiBalance {
  /** Seconds between flow-field rebuilds. */
  flowEvery: number;
  /** A flow field's reach, in cells. */
  flowRadius: number;
  /** A foe with sight of the hero this close steers straight at it. */
  directRange: number;
  /** A foe farther than this from its room's centre for `leashSeconds` goes home. */
  leashRadius: number;
  leashSeconds: number;
  /** Seconds a sealing door waits for the doorway to clear. */
  sealGrace: number;
  /** A room's last kill pulls its foes' drops to the hero. */
  roomVacuum: boolean;
  /** How far the hero sees, in units. */
  sightRadius: number;
  /** Seconds between fog updates. */
  fogEvery: number;
  /** Seconds before the minimap points to an unfound exit. */
  exitHintSeconds: number;
  /** How near an interactable must be to use it. */
  interactRadius: number;
  /** Seconds a shrine's prayer takes. */
  shrineChannel: number;
}

// ── The HUD's map (`hudMapOf`) ─────────────────────────────────────────────

export type HudIcon = 'chest' | 'shrine' | 'anvil' | 'skull' | 'gate';

export interface HudRoom {
  id: number;
  kind: RoomKind;
  rect: Rect;
  icon: HudIcon | null;
  /** Its interactable is used (an open chest, a spent shrine). */
  used: boolean;
  cleared: boolean;
  sealed: boolean;
}

/** What the minimap draws: revealed rooms only, foes the hero sees, drops in revealed cells. */
export interface HudMap {
  width: number;
  height: number;
  rooms: HudRoom[];
  /** The exit gate once its room is revealed. */
  exit: Vec | null;
  /** Where the compass points after `ai.exitHintSeconds` without the exit. */
  hint: Vec | null;
  foes: { x: number; y: number; kind: MonsterKind }[];
  drops: { x: number; y: number; kind: DropKind }[];
  /** Rooms explored n / m: revealed, and all. */
  explored: number;
  total: number;
  /** `ArpgWorld.fogVersion`: the fog layer redraws only when it moves. */
  fogVersion: number;
}
