import type { Vec } from './arpg.js';
import type { MaterialRef } from './crafting.js';
import type { MonsterTrait } from './delve.js';
import type { InteractableKind, Rect, RoomKind } from './floor-map.js';
import type { Rarity } from './gear.js';

/**
 * The guided start's hand-built floors (`tutorial.json → floors`; see the
 * tutorial spec's "Hand-built floors"): the grid as ASCII rows, its rooms,
 * its foes, its markers and its set drops.
 */

/**
 * The cells a floor's rows may hold: `#` wall, `.` floor, `0`–`9` a door by
 * its index, `S` the start, `X` the exit gate, `C` a chest, `H` a shrine,
 * `A` an anvil alcove (each of the last five on floor).
 */
export const TUTORIAL_CELLS = '#.0123456789SXCHA';

/** The interactable each of those cells places: one a room at most. */
export const TUTORIAL_INTERACTABLES: Readonly<Record<string, InteractableKind>> = {
  C: 'chest',
  H: 'shrine',
  A: 'alcove',
  X: 'gate',
};

/** A foe's script: `slamOnly` holds its ground and only slams, on a fixed cadence with a long telegraph. */
export type TutorialScript = 'slamOnly';

/** A room of a hand-built floor, as a generated room (at most one interactable). */
export interface TutorialRoomDef {
  /** Its index in `rooms`. */
  id: number;
  kind: RoomKind;
  rect: Rect;
}

/** A placed foe: a `delve.json` monster (a biome's or its boss), in its room. */
export interface TutorialSpawn {
  /** Unique on its floor: a set drop's `spawn:<id>` and `MonsterEntity.spawnId`. */
  id: string;
  monster: string;
  at: Vec;
  room: number;
  /** The floor's boss. */
  boss?: true;
  /** An elite, with these traits. */
  elite?: { traits: MonsterTrait[] };
  script?: TutorialScript;
  hpMult?: number;
  damageMult?: number;
}

/** A spot a step names (`TutorialStep.marker`): reached when the hero comes within its radius. */
export interface TutorialMarker {
  id: string;
  at: Vec;
}

/**
 * What a set drop gives: gear in the pair's primary or secondary (its Primary at
 * `slots.primary` slots, within its rarity's ceiling, plain-filled; `sockets` open
 * on its constructs, one each), on the fork `tutorial:<dropId>`; a rune that fits
 * the Primary's first move at drop time; a material (Mana Dust and Links included)
 * or scrap, by count.
 */
export type TutorialDrop =
  | {
      kind: 'gear';
      base: string;
      rarity: Rarity;
      element: 'primary' | 'secondary';
      slots?: { primary?: number };
      sockets?: number;
    }
  | { kind: 'rune'; rune: 'fitsPrimary'; tier: number }
  | { kind: 'material'; material: MaterialRef; count: number }
  | { kind: 'scrap'; count: number };

/** A set drop: when it falls (`spawn:<id>` that foe's death, `chest` the chest opening, `boss` the boss's death) and what. */
export interface TutorialSetDrop {
  /** Unique on its floor: its stream is `tutorial:<id>`. */
  id: string;
  on: string;
  drop: TutorialDrop;
}

/** A hand-built floor: the depth `depth` of the guided start's dive `dive`. */
export interface TutorialFloorDef {
  id: string;
  dive: number;
  depth: number;
  /** Equal-length rows of `TUTORIAL_CELLS`, top to bottom. */
  rows: string[];
  rooms: TutorialRoomDef[];
  spawns: TutorialSpawn[];
  markers: TutorialMarker[];
  drops: TutorialSetDrop[];
}
