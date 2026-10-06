import type { DropKind } from './arpg.js';
import type { MaterialRef } from './crafting.js';
import type { StopKind } from './delve.js';
import type { InteractableKind } from './floor-map.js';
import type { GearSlot } from './gear.js';
import type { ManaType } from './mana.js';
import type { QuestEvent, QuestId } from './quests.js';
import type { TutorialFloorDef } from './tutorial-floor.js';

/**
 * The guided start (see the tutorial spec): the save's state, the script's
 * steps (`tutorial.json`), the events that advance them, and the text parts
 * the client draws. The hand-built floors' shapes are in `tutorial-floor.ts`.
 */

/** The save's tutorial (`DelveProfile.tutorial`): the current step, its count, and its misses. */
export interface TutorialState {
  /** The current step's id in `tutorial.json → steps`. */
  step: string;
  /** How far the current step's trigger has come (it completes at `trigger.count`). */
  count: number;
  /** A step with `skipAfter`: its misses (perfect-dodge tries, or seconds) so far. */
  misses: number;
}

/**
 * A floor's tutorial (`ArpgWorld.tutorial`): the state, and every tutorial
 * event since the floor began, counted by type and filter (`tally`), so a
 * floor step done before it became current still completes.
 */
export interface WorldTutorial extends TutorialState {
  tally: Record<string, number>;
}

/** Where a step happens: on a hand-built floor, at a stop, at the Anvil, or in the Training Grounds. */
export const TUTORIAL_WHERE = ['floor', 'stop', 'anvil', 'training'] as const;
export type TutorialWhere = (typeof TUTORIAL_WHERE)[number];

/**
 * What a step can wait for: the quest events (`QuestEvent`) and the
 * tutorial's own (`TutorialOnlyEvent`), but never `skipStep`.
 */
export const TUTORIAL_TRIGGERS = [
  'kill',
  'reachDepth',
  'clearFloor',
  'extract',
  'boss',
  'reaction',
  'perfectDodge',
  'forge',
  'refine',
  'bind',
  'openSocket',
  'marker',
  'cast',
  'pickup',
  'interact',
  'dodge',
  'potion',
  'takeStop',
  'ack',
  'claim',
  'equip',
  'setChains',
  'salvage',
  'transfer',
  'hone',
] as const;
export type TutorialTriggerType = (typeof TUTORIAL_TRIGGERS)[number];

/**
 * The events quests ignore: on a floor, the world's own (from its
 * `ArpgEvent`s: a marker reached, a cast with its slot, chain step and
 * whether it was aimed, a pickup by kind, an interactable used, a dodge, a
 * potion drunk); off it, a stop's power-up, a reading beat's Continue (`ack`),
 * the Anvil's ops, and a "Skip this step" (`skipStep`, allowed only when
 * `tutorialSkippable`).
 */
export type TutorialOnlyEvent =
  | { type: 'marker'; id: string }
  | { type: 'cast'; slot: number; step: number; aimed: boolean }
  | { type: 'pickup'; dropKind: DropKind; material?: MaterialRef['kind'] }
  | { type: 'interact'; interactable: InteractableKind }
  | { type: 'dodge' }
  | { type: 'potion' }
  | { type: 'takeStop'; kind: StopKind }
  | { type: 'ack' }
  | { type: 'claim'; quest: QuestId }
  | { type: 'equip'; slot: GearSlot }
  | { type: 'setChains' }
  | { type: 'salvage'; slot: GearSlot }
  | { type: 'transfer' }
  | { type: 'hone' }
  | { type: 'skipStep' };

/** Everything that can advance the tutorial (`tutorialAdvance`, `applyTutorialEvents`). */
export type TutorialEvent = QuestEvent | TutorialOnlyEvent;

/** A step's trigger: `count` events of `type` whose fields equal every `filter` entry. */
export interface TutorialTrigger {
  type: TutorialTriggerType;
  /** Event fields to match (e.g. a cast's `{ slot: 0, step: 1 }`, a pickup's `{ dropKind: 'item' }`). */
  filter?: Record<string, string | number | boolean>;
  count: number;
}

/**
 * The client's targets a step can highlight (`data-tutorial="<target>"`):
 * the HUD's, the stop's, and the Anvil's tabs, panes and buttons.
 */
export const TUTORIAL_TARGETS = [
  'hud.primary',
  'hud.defensive',
  'hud.dodge',
  'hud.potion',
  'hud.minimap',
  'hud.vitals',
  'stop.powerup',
  'stop.doors',
  'stop.extract',
  'stop.risk',
  'stop.pick',
  'hub.tab.loadout',
  'hub.tab.skills',
  'hub.tab.forge',
  'hub.tab.quests',
  'hub.training',
  'hub.delve',
  'loadout.equip',
  'loadout.salvage',
  'loadout.compare',
  'loadout.transfer',
  'forge.pattern',
  'forge.bar',
  'forge.flux',
  'forge.shard',
  'forge.go',
  'forge.bench',
  'forge.temper',
  'forge.materials',
  'forge.refine',
  'temper.hone',
  'temper.line',
  'temper.go',
  'skills.mana',
  'mana.bind',
  'mana.confirm',
  'skills.primary',
  'skills.addSlot',
  'skills.elements',
  'skills.socket',
  'skills.rune',
  'skills.apply',
  'quests.done',
  'quests.claim',
  'quests.board',
] as const;
export type TutorialTarget = (typeof TUTORIAL_TARGETS)[number];

/**
 * The targets that are one control among several, named `<target>:<key>`, and
 * what each key is: a gear base's id, a metal's id, a flux grade,
 * `<slot>.<rarity>`, `first` or `last`, or a stop's power-up kind
 * (`tutorialDataProblems` checks each against the data).
 */
export const TUTORIAL_KEYED_TARGETS = {
  'forge.pattern': 'base',
  'forge.bar': 'metal',
  'forge.flux': 'flux',
  'forge.refine': 'metal',
  'loadout.bag': 'slotRarity',
  'skills.card': 'end',
  'stop.card': 'stopKind',
} as const;
export type TutorialKeyedTarget = keyof typeof TUTORIAL_KEYED_TARGETS;

/** An entry of a step's trail: a target, or one control of a keyed target (`forge.pattern:cuirass`). */
export type TutorialTrailTarget = TutorialTarget | `${TutorialKeyedTarget}:${string}`;

/** The inputs a line's `{input:<action>}` names: the client draws each as its binding's glyph. */
export const TUTORIAL_INPUTS = [
  'move',
  'aim',
  'attack',
  'primary',
  'defensive',
  'ultimate',
  'dodge',
  'potion',
  'interact',
  'menu',
  'journal',
] as const;
export type TutorialInput = (typeof TUTORIAL_INPUTS)[number];

/**
 * A tutorial stop (after its floor's depth): the power-ups it offers (with
 * `stopKinds`), the doors, and whether Extract is the only road.
 */
export interface TutorialStopDef {
  kinds: StopKind[];
  /** `delve.json` door ids; none skips a depth. Empty with `extract`. */
  doors: string[];
  extract: boolean;
}

/** One step of the script (`tutorial.json → steps`), in order. */
export interface TutorialStep {
  id: string;
  where: TutorialWhere;
  /** A floor or stop step's hand-built floor (`floors[].id`): the stop is the one after its depth. */
  floor?: string;
  /** Hesta's line, and the objective line (templates: `tutorialText`). */
  line: string;
  objective: string;
  highlight?: TutorialTarget;
  /**
   * The clicks of an Anvil, Training or stop step, in order: the client marks
   * the first still to do, then the `highlight`. Carried and checked only: no
   * rule reads it.
   */
  trail?: TutorialTrailTarget[];
  /** A reading beat: the arena pauses until Continue (`ack`). */
  beat?: boolean;
  trigger: TutorialTrigger;
  /** A floor step's gates: door `door` (its index on the floor) held shut, or the exit gate, until it completes. */
  gate?: { door?: number; exit?: true };
  /** "Skip this step" once `misses` reaches this. */
  skipAfter?: number;
  /** A floor step's marker (`floors[].markers[].id`), drawn on the floor. */
  marker?: string;
  stop?: TutorialStopDef;
  /** A floor step's anvil alcove: the power-ups it offers (with what's affordable). */
  alcove?: { kinds: StopKind[] };
}

/** `tutorial.json`: the script, Hesta's suggested partners, and the hand-built floors. */
export interface TutorialData {
  steps: TutorialStep[];
  /** The secondary Hesta suggests at the bind, by primary. */
  partners: Record<ManaType, ManaType>;
  floors: TutorialFloorDef[];
}

/** A run of text, or an input drawn as its binding's glyph. */
export type TutorialTextPart = { text: string } | { input: TutorialInput };

/** A step's line and objective, filled (`tutorialText`): the client formats nothing. */
export interface TutorialText {
  line: TutorialTextPart[];
  objective: TutorialTextPart[];
}
