import type {
  ArpgEvent,
  DataRegistry,
  TutorialEvent,
  TutorialState,
  TutorialStep,
  TutorialWhere,
} from '@alloy/engine';

/**
 * The guided start as the client reads it (see the tutorial spec): the engine runs the script;
 * this only looks a step up and passes the Training Grounds' casts on.
 */

/** Where each screen shows Hesta's panel: the dive its floors and stops, the Anvil its lessons and the Training step, the Training Grounds theirs. */
export const SHOWN_AT = {
  dive: ['floor', 'stop'],
  anvil: ['anvil', 'training'],
  training: ['training'],
} as const satisfies Record<string, readonly TutorialWhere[]>;

/** The data of `state`'s step when it happens in one of `where`, else undefined (none running included). */
export function stepIn(
  registry: DataRegistry,
  state: TutorialState | null | undefined,
  where: readonly TutorialWhere[],
): TutorialStep | undefined {
  if (!state) return undefined;
  const step = registry.getTutorialData().steps.find((s) => s.id === state.step);
  return step && where.includes(step.where) ? step : undefined;
}

/**
 * The Training Grounds' one path into the guided start: while its step is a Training step, a
 * sandbox step's casts as the tutorial reads them (its trigger); none otherwise.
 */
export function trainingEvents(
  registry: DataRegistry,
  state: TutorialState | null | undefined,
  events: readonly ArpgEvent[],
): TutorialEvent[] {
  if (!stepIn(registry, state, SHOWN_AT.training)) return [];
  return events.flatMap((e) =>
    e.kind === 'cast'
      ? [{ type: 'cast' as const, slot: e.slot, step: e.step, aimed: e.aimed }]
      : [],
  );
}
