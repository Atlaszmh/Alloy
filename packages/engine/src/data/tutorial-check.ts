import { TUTORIAL_INPUTS, type TutorialStep } from '../types/tutorial.js';
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

/**
 * `tutorial.json`'s steps checked against the floors and the other data
 * files (see the tutorial spec): a floor or stop step names a floor, an Anvil
 * or Training step none; a marker, a gate or an alcove only on a floor step,
 * a stop only on a stop step; its marker on its floor, its gated door among
 * the floor's; a stop's doors known and none skipping a depth; only known
 * tokens. One line a problem; `createDefaultRegistry` refuses data with any.
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
    if (s.marker)
      check(s, !!floor?.markers.some((m) => m.id === s.marker), `no marker ${s.marker}`);
    if (s.gate?.door !== undefined)
      check(s, !!floor && s.gate.door < tutorialDoorCount(floor), `no door ${s.gate.door}`);
    for (const id of s.stop?.doors ?? []) {
      const door = doors.find((d) => d.id === id);
      check(s, !!door, `no door ${id}`);
      check(s, !door?.mods.skip, `door ${id} skips a depth`);
    }
    for (const t of [...badTokens(s.line), ...badTokens(s.objective)])
      problems.push(`${s.id}: no token {${t}}`);
  }
  return problems;
}
