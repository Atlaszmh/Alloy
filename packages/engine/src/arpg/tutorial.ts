import type { DataRegistry } from '../data/registry.js';
import type { ArpgWorld } from '../types/arpg.js';
import type { TutorialEvent } from '../types/tutorial.js';
import type { SimCtx } from './combat.js';

/**
 * The guided start on a floor (see the tutorial spec): the world's tallies,
 * its markers, its gates and its step. Phase A's stubs: the hooks are no-ops
 * (no world has a tutorial yet) and the rest throw until B1 fills them.
 */

/**
 * `tick()`'s last hook: this tick's events tallied (`world.tutorial.tally`:
 * kills, casts, pickups and interactables by kind, dodges, perfect dodges,
 * potions, reactions, markers reached), the current step advanced
 * (`tutorialAdvance`), its misses counted, and its gates held or let go
 * (`Door.held`, the exit). A no-op while `world.tutorial` is null.
 */
export function tutorialTick(_ctx: SimCtx): void {}

/** The exit gate waits for the floor's steps (a step's `gate.exit`): its interact is refused. */
export function tutorialExitHeld(_world: ArpgWorld): boolean {
  return false;
}

/** Events the client raises mid-floor (a beat's `ack`, a `skipStep`) fed into `world.tutorial`. */
export function worldTutorialEvents(
  _registry: DataRegistry,
  _world: ArpgWorld,
  _events: readonly TutorialEvent[],
): void {
  throw new Error('worldTutorialEvents: not implemented');
}
