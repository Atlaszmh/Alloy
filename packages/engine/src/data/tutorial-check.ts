import type { StopKind } from '../types/delve.js';
import { GEAR_SLOTS, RARITY_ORDER } from '../types/gear.js';
import {
  TUTORIAL_INPUTS,
  TUTORIAL_KEYED_TARGETS,
  TUTORIAL_TARGETS,
  type TutorialKeyedTarget,
  type TutorialStep,
} from '../types/tutorial.js';
import type { DataRegistry } from './registry.js';
import { tutorialDoorCount } from './tutorial-floor-schema.js';

/** The tokens a line or an objective may hold (`tutorialText` fills them). */
const TOKENS = ['primary', 'secondary', 'partner', 'primarySkill', 'reaction'];

/** The `{…}` tokens of `text` that `tutorialText` can't fill. */
function badTokens(text: string): string[] {
  return [...text.matchAll(/\{([^}]*)\}/g)]
    .map((m) => m[1])
    .filter((t) => {
      const input = /^input:(.+)$/.exec(t);
      return input
        ? !(TUTORIAL_INPUTS as readonly string[]).includes(input[1])
        : !TOKENS.includes(t);
    });
}

/** Whether `key` names one of `target`'s controls: a thing of its kind in the data (a stop card: a kind `s`'s stop offers). */
function keyKnown(
  registry: DataRegistry,
  s: TutorialStep,
  target: TutorialKeyedTarget,
  key: string,
): boolean {
  switch (TUTORIAL_KEYED_TARGETS[target]) {
    case 'base':
      return registry.getDelveData().bases.some((b) => b.id === key);
    case 'metal':
      return registry.getCraftingData().metals.some((m) => m.id === key);
    case 'flux':
      return registry.getCraftingData().flux.some((f) => f.grade === key);
    case 'slotRarity': {
      const [slot, rarity, more] = key.split('.');
      return (
        more === undefined &&
        (GEAR_SLOTS as readonly string[]).includes(slot) &&
        (RARITY_ORDER as readonly string[]).includes(rarity)
      );
    }
    case 'end':
      return key === 'first' || key === 'last';
    case 'stopKind':
      return !!s.stop?.kinds.includes(key as StopKind);
  }
}

/** What is wrong with one entry of `s`'s trail, or null: an unknown target, a key on a target that takes none, or a key the data lacks. */
function trailProblem(registry: DataRegistry, s: TutorialStep, entry: string): string | null {
  const known = (t: string) => (TUTORIAL_TARGETS as readonly string[]).includes(t);
  const at = entry.indexOf(':');
  if (at < 0) return known(entry) ? null : `no target ${entry}`;
  const target = entry.slice(0, at);
  const key = entry.slice(at + 1);
  if (!Object.hasOwn(TUTORIAL_KEYED_TARGETS, target))
    return known(target) ? `${target} takes no key` : `no target ${target}`;
  return keyKnown(registry, s, target as TutorialKeyedTarget, key) ? null : `no ${target} ${key}`;
}

/**
 * `tutorial.json`'s steps checked against the floors and the other data
 * files (see the tutorial spec): a floor or stop step names a floor, an Anvil
 * or Training step none; a marker, a gate or an alcove only on a floor step,
 * a stop only on a stop step; its marker on its floor, its gated door among
 * the floor's; a stop's doors known and none skipping a depth, and either
 * doors or Extract; the floors in their order, never back to an earlier one;
 * only known tokens; a trail only on an Anvil, Training or stop step, each
 * entry a known target, a key only on a keyed one (`TUTORIAL_KEYED_TARGETS`)
 * and present in the data. One line a problem; `createDefaultRegistry` refuses
 * data with any.
 * (Trigger types, stop kinds, targets and partners are the schema's.)
 */
export function tutorialDataProblems(registry: DataRegistry): string[] {
  const { steps, floors } = registry.getTutorialData();
  const doors = registry.getDelveData().doors;
  const problems: string[] = [];
  const check = (s: TutorialStep, ok: boolean, what: string) => {
    if (!ok) problems.push(`${s.id}: ${what}`);
  };
  for (const s of steps) {
    const onFloor = s.where === 'floor' || s.where === 'stop';
    const floor = floors.find((f) => f.id === s.floor);
    check(s, onFloor ? !!floor : s.floor === undefined, onFloor ? 'names its floor' : 'no floor');
    check(
      s,
      s.where === 'floor' || (!s.marker && !s.gate && !s.alcove),
      'marker, gate and alcove on a floor step',
    );
    check(s, s.where === 'stop' || !s.stop, 'a stop on a stop step');
    check(s, s.where !== 'floor' || !s.trail, 'a trail on an Anvil, Training or stop step');
    for (const entry of s.trail ?? []) {
      const problem = trailProblem(registry, s, entry);
      if (problem) problems.push(`${s.id}: ${problem}`);
    }
    if (s.marker)
      check(s, !!floor?.markers.some((m) => m.id === s.marker), `no marker ${s.marker}`);
    if (s.gate?.door !== undefined)
      check(s, !!floor && s.gate.door < tutorialDoorCount(floor), `no door ${s.gate.door}`);
    if (s.stop)
      check(s, s.stop.doors.length > 0 !== s.stop.extract, 'doors or Extract, one of them');
    for (const id of s.stop?.doors ?? []) {
      const door = doors.find((d) => d.id === id);
      check(s, !!door, `no door ${id}`);
      check(s, !door?.mods.skip, `door ${id} skips a depth`);
    }
    for (const t of [...badTokens(s.line), ...badTokens(s.objective)])
      problems.push(`${s.id}: no token {${t}}`);
  }
  // One sequence: the steps walk the floors in their order, never back to an earlier one.
  let reached = -1;
  for (const s of steps) {
    const at = floors.findIndex((f) => f.id === s.floor);
    if (at >= 0 && at < reached) problems.push(`${s.id}: back to floor ${s.floor}`);
    reached = Math.max(reached, at);
  }
  return problems;
}
