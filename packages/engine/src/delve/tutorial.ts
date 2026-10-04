import type { DataRegistry } from '../data/registry.js';
import type { FloorOptions } from '../arpg/world.js';
import type { ArpgWorld } from '../types/arpg.js';
import type { DelveProfile } from '../types/delve.js';
import type {
  TutorialEvent,
  TutorialState,
  TutorialStep,
  TutorialText,
} from '../types/tutorial.js';

/**
 * The guided start on the profile (see the tutorial spec): starting and
 * skipping it, its one rule, the state its steps read, its text, the retry,
 * and the hooks the dive and the Anvil's ops call. Phase A's stubs: the hooks
 * are inert (no tutorial is ever on), the queries answer "none", the rest
 * throw until B1 fills them. dive.ts, quests.ts and the ops import this
 * module and it will import them back: keep to function declarations.
 */

function todo(name: string): never {
  throw new Error(`${name}: not implemented`);
}

/** A new save's guided start: its first step (`tutorial.json → steps[0]`). */
export function startTutorial(_registry: DataRegistry, _profile: DelveProfile): DelveProfile {
  return todo('startTutorial');
}

/**
 * Drop the rails: the profile's tutorial cleared, and `world`'s (a floor in
 * progress plays out, its gates let go); the save is ordinary from here.
 */
export function skipTutorial(_profile: DelveProfile, _world?: ArpgWorld | null): DelveProfile {
  return todo('skipTutorial');
}

/**
 * The one rule: `state` after `event`. The current step's count grows by a
 * matching event (its trigger's type, every filter entry equal), it completes
 * at the trigger's count, and the next step becomes current with a count of 0;
 * `skipStep` completes a skippable step. Null once the last step completes.
 */
export function tutorialAdvance(
  _registry: DataRegistry,
  _state: TutorialState,
  _event: TutorialEvent,
): TutorialState | null {
  return todo('tutorialAdvance');
}

/**
 * The profile with `events` applied to its tutorial, then each step that holds
 * (`tutorialHolds`) completed in turn; with no tutorial running, the profile
 * as it is. Every op that emits quest events calls it after `applyQuestEvents`
 * with the same events and its own (claim, equip, setChains, salvage, transfer,
 * hone); the client calls it for a beat's `ack`, a `skipStep` and the Training
 * Grounds' cast.
 */
export function applyTutorialEvents(
  _registry: DataRegistry,
  profile: DelveProfile,
  _events: readonly TutorialEvent[],
): DelveProfile {
  return profile;
}

/** Whether a stop or Anvil step's condition holds on the profile (a step with no state waits for its event). */
export function tutorialHolds(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _step: TutorialStep,
): boolean {
  return todo('tutorialHolds');
}

/**
 * Step `step`'s line and objective, its tokens filled for the profile's pair
 * and the hero's Primary (`world`: a floor's hero, for the Primary's next move).
 */
export function tutorialText(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _step: string,
  _world?: ArpgWorld | null,
): TutorialText {
  return todo('tutorialText');
}

/**
 * Whether "Skip this step" is offered for `state` (the profile's, or a floor's
 * `world.tutorial`): its misses at the step's `skipAfter`, or an Anvil step
 * whose op the hero can't pay. False with no tutorial.
 */
export function tutorialSkippable(
  _registry: DataRegistry,
  _profile: DelveProfile,
  _state: TutorialState,
): boolean {
  return false;
}

/**
 * A tutorial death, Abandon or floor restart: the profile as it entered the
 * depth (`DiveState.tutorialEntry`), everything the floor banked reverted;
 * the client then builds the depth again (`beginFloor`).
 */
export function retryTutorialDepth(_registry: DataRegistry, _profile: DelveProfile): DelveProfile {
  return todo('retryTutorialDepth');
}

/**
 * The hand-built floor `beginFloor` builds for the profile's current step, and
 * the state the world starts from; undefined (a generated floor) with no
 * tutorial running.
 */
export function tutorialFloorOf(
  _registry: DataRegistry,
  _profile: DelveProfile,
): FloorOptions['tutorial'] {
  return undefined;
}

/** Why the Anvil's Delve waits ("Finish Hesta's lesson or skip it"), or null: no lesson under way. */
export function tutorialBlocksDive(_registry: DataRegistry, _profile: DelveProfile): string | null {
  return null;
}
