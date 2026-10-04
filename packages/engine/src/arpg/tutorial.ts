import type { DataRegistry } from '../data/registry.js';
import {
  floorSkippable,
  triggerMatches,
  tutorialAdvance,
  tutorialNext,
  tutorialStep,
} from '../delve/tutorial.js';
import type { ArpgEvent, ArpgWorld } from '../types/arpg.js';
import type { TutorialEvent } from '../types/tutorial.js';
import type { SimCtx } from './combat.js';
import { dist } from './geometry.js';
import { setDoor } from './grid.js';

/**
 * The guided start on a floor (see the tutorial spec): the world's tallies,
 * its markers, its gates and its step. delve/tutorial.ts holds the rule.
 */

/** How near a marker's point the hero must come to reach it (units). */
const MARKER_REACH = 1.5;

/** A tallied event: its type and its fields, flat. */
type Tally = Record<string, string | number | boolean>;

/** How much of each `stepWorld` call's events the tallies have read (one list for all its ticks). */
const read = new WeakMap<ArpgEvent[], number>();
/** Whether each world's exit gate is held, as its gates were last set. */
const exitHeld = new WeakMap<ArpgWorld, boolean>();
/** When each world's current step began counting seconds (a seconds step's misses). */
const since = new WeakMap<ArpgWorld, { step: string; t: number }>();

/** A tally's key: the event's fields in order, so equal events share it. */
function keyOf(e: Tally): string {
  return JSON.stringify(
    Object.keys(e)
      .sort()
      .map((k) => [k, e[k]]),
  );
}

/** How many tallied events match `trigger` (its type and filter). */
function tallied(tally: Record<string, number>, trigger: Parameters<typeof triggerMatches>[0]) {
  let n = 0;
  for (const [key, count] of Object.entries(tally)) {
    const e = Object.fromEntries(JSON.parse(key) as [string, string][]) as { type: string };
    if (triggerMatches(trigger, e)) n += count;
  }
  return n;
}

/**
 * An arena event as the tallies count it: a kill (a boss's death is `boss`;
 * a hand-built floor's foe carries its `spawn`), a cast (its slot, chain step
 * and aim), a pickup (its kind, a material's kind), an interactable used (a
 * chest, a shrine's blessing, an alcove opened), a dodge, a perfect dodge, a
 * potion, a reaction (`pair`: the hero's pair's), a room cleared (its kind).
 */
function tallyOf(ctx: SimCtx, e: ArpgEvent): Tally | null {
  const { world, registry } = ctx;
  switch (e.kind) {
    case 'death': {
      const m = world.monsters.find((x) => x.id === e.id);
      if (!m) return null;
      if (m.kind === 'boss') return { type: 'boss', biome: world.biomeId };
      const kill: Tally = { type: 'kill', kind: m.kind, biome: world.biomeId, element: m.element };
      if (m.spawnId) kill.spawn = m.spawnId;
      return kill;
    }
    case 'cast':
      return { type: 'cast', slot: e.slot, step: e.step, aimed: e.aimed };
    case 'pickup':
      return {
        type: 'pickup',
        dropKind: e.dropKind,
        ...(e.material && { material: e.material.kind }),
      };
    case 'used':
      return { type: 'interact', interactable: e.interactable };
    case 'alcoveOpen':
      return { type: 'interact', interactable: 'alcove' };
    case 'dodge':
      return { type: 'dodge' };
    case 'perfectDodge':
      return { type: 'perfectDodge' };
    case 'heal':
      return e.source === 'potion' ? { type: 'potion' } : null;
    case 'reaction': {
      const [a, b] = world.loot.pair;
      const pair = !!b && registry.getReactionFor(a, b).id === e.reaction;
      return { type: 'reaction', reaction: e.reaction, pair };
    }
    case 'roomCleared': {
      const room = world.map.rooms.find((r) => r.id === e.roomId);
      return room ? { type: 'roomCleared', room: room.kind } : null;
    }
    default:
      return null;
  }
}

/**
 * `tick()`'s last hook: this tick's events tallied (`world.tutorial.tally`),
 * the floor's markers reached, the current step's misses counted (a
 * `skipAfter` step: a perfect-dodge step's dodges, any other's seconds), then
 * every floor step its tallies complete passed in turn, and the gates set for
 * the step now current (`Door.held`, the exit). A no-op while
 * `world.tutorial` is null.
 */
export function tutorialTick(ctx: SimCtx): void {
  const { world, events, registry } = ctx;
  const tut = world.tutorial;
  if (!tut) return;
  const from = read.get(events) ?? 0;
  read.set(events, events.length);
  let dodges = 0;
  for (const e of events.slice(from)) {
    if (e.kind === 'dodge') dodges++;
    const t = tallyOf(ctx, e);
    if (t) tut.tally[keyOf(t)] = (tut.tally[keyOf(t)] ?? 0) + 1;
  }
  const floor = registry.getTutorialData().floors.find((f) => f.id === world.tutorialFloor);
  for (const m of floor?.markers ?? []) {
    const key = keyOf({ type: 'marker', id: m.id });
    if (!tut.tally[key] && dist(world.hero.x, world.hero.y, m.at.x, m.at.y) <= MARKER_REACH)
      tut.tally[key] = 1;
  }
  const step = tutorialStep(registry, tut);
  if (step?.skipAfter !== undefined) {
    if (step.trigger.type === 'perfectDodge') tut.misses += dodges;
    else {
      const start = since.get(world);
      if (start?.step !== tut.step) since.set(world, { step: tut.step, t: world.t - tut.misses });
      else tut.misses = Math.max(tut.misses, Math.floor(world.t - start.t));
    }
  }
  settle(registry, world);
}

/**
 * The floor's steps its tallies complete, passed in turn (a `potion` step
 * also once a den is cleared with nothing to drink for: life full, or no
 * potion left), each next step at the count its tallies give; then the gates
 * of the step now current.
 */
function settle(registry: DataRegistry, world: ArpgWorld): void {
  for (;;) {
    const tut = world.tutorial;
    const step = tutorialStep(registry, tut);
    if (!tut || step?.where !== 'floor' || step.floor !== world.tutorialFloor) break;
    const count = tallied(tut.tally, step.trigger);
    const h = world.hero;
    const spared =
      step.trigger.type === 'potion' &&
      tallied(tut.tally, { type: 'roomCleared', filter: { room: 'den' } }) > 0 &&
      (h.hp >= h.stats.maxHp || h.potions === 0);
    if (count < step.trigger.count && !spared) {
      tut.count = count;
      break;
    }
    const next = tutorialNext(registry, tut);
    world.tutorial = next && { ...next, tally: tut.tally };
  }
  const tut = world.tutorial;
  const step = tutorialStep(registry, tut);
  const gate =
    step?.where === 'floor' && step.floor === world.tutorialFloor ? step.gate : undefined;
  world.map.doors.forEach((d, i) => {
    if (!!d.held !== (gate?.door === i)) setDoor(world.map, d, 'held', gate?.door === i);
  });
  exitHeld.set(world, !!gate?.exit);
}

/** The exit gate waits for the floor's steps (a step's `gate.exit`): its interact is refused. */
export function tutorialExitHeld(world: ArpgWorld): boolean {
  return !!world.tutorial && exitHeld.get(world) === true;
}

/**
 * Events the client raises mid-floor fed into `world.tutorial`: a beat's
 * `ack`, and a `skipStep` (only while `floorSkippable`); then the
 * floor's steps and gates settle as a tick's do.
 */
export function worldTutorialEvents(
  registry: DataRegistry,
  world: ArpgWorld,
  events: readonly TutorialEvent[],
): void {
  for (const e of events) {
    const tut = world.tutorial;
    if (!tut) break;
    if (e.type === 'skipStep' && !floorSkippable(registry, tut, world)) continue;
    const next = tutorialAdvance(registry, tut, e);
    if (next !== tut) world.tutorial = next && { ...next, tally: tut.tally };
  }
  settle(registry, world);
}
