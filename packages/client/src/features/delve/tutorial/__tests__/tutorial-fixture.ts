import { vi } from 'vitest';
import type {
  DataRegistry,
  TutorialInput,
  TutorialState,
  TutorialStep,
  TutorialText,
  TutorialTextPart,
} from '@alloy/engine';
import { getDelveRegistry } from '../../registry';

/** A script with a step of each kind the client draws (the tutorial's B1 writes the real one). */
export const STEPS: TutorialStep[] = [
  {
    id: 'cast',
    where: 'floor',
    floor: 'd1-2',
    line: 'Cast your Primary.',
    objective: 'Cast with {input:primary}',
    trigger: { type: 'cast', filter: { slot: 0 }, count: 2 },
  },
  {
    id: 'walk',
    where: 'floor',
    floor: 'd1-1',
    line: 'Walk to the light.',
    objective: 'Walk with {input:move}',
    marker: 'walk',
    trigger: { type: 'marker', filter: { id: 'walk' }, count: 1 },
  },
  {
    id: 'listen',
    where: 'floor',
    floor: 'd1-2',
    line: 'Fog hides the rooms.',
    objective: 'Continue',
    beat: true,
    trigger: { type: 'ack', count: 1 },
  },
  {
    id: 'equip',
    where: 'stop',
    floor: 'd1-1',
    line: 'Better weapons carry more skills.',
    objective: 'Equip the new weapon',
    stop: { kinds: ['equip'], doors: ['winding'], extract: false },
    trigger: { type: 'takeStop', count: 1 },
  },
  {
    id: 'welcome',
    where: 'anvil',
    line: 'Welcome to the Anvil.',
    objective: 'Continue',
    beat: true,
    trigger: { type: 'ack', count: 1 },
  },
  {
    id: 'forge',
    where: 'anvil',
    line: 'Forge a cuirass.',
    objective: 'Forge and equip a cuirass',
    highlight: 'hub.tab.forge',
    trigger: { type: 'forge', count: 1 },
  },
  {
    id: 'raise',
    where: 'training',
    line: 'Raise your Defensive.',
    objective: 'Cast it with {input:defensive}',
    trigger: { type: 'cast', filter: { slot: 1 }, count: 1 },
  },
];

/** The state at step `step`. */
export const at = (step: string, count = 0): TutorialState => ({ step, count, misses: 0 });

/** The registry's script is `STEPS` until the test ends. */
export function withSteps(): void {
  const registry = getDelveRegistry();
  const data = registry.getTutorialData();
  vi.spyOn(registry, 'getTutorialData').mockReturnValue({ ...data, steps: STEPS });
}

/** `tutorialText` as a stand-in: the step's own line and objective, each `{input:…}` a part. */
export function fakeText(registry: DataRegistry, _profile: unknown, id: string): TutorialText {
  const step = registry.getTutorialData().steps.find((s) => s.id === id)!;
  const parts = (s: string): TutorialTextPart[] =>
    s
      .split(/(\{input:\w+\})/)
      .filter(Boolean)
      .map((x) => {
        const m = /^\{input:(\w+)\}$/.exec(x);
        return m ? { input: m[1] as TutorialInput } : { text: x };
      });
  return { line: parts(step.line), objective: parts(step.objective) };
}
