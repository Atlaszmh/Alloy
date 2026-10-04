import { createDefaultRegistry } from '../../src/data/default-registry.js';
import { loadAndValidateData } from '../../src/data/loader.js';
import { DataRegistry } from '../../src/data/registry.js';
import { createDelveProfile } from '../../src/delve/profile.js';
import type { DelveProfile } from '../../src/types/delve.js';
import type { TutorialStep, TutorialTrigger } from '../../src/types/tutorial.js';

/**
 * A short guided start for the runner's tests (see the tutorial spec): the
 * real script's shapes on the floors `d1-1` and `d1-2`, without its text, so
 * the tests hold whatever `tutorial.json` says. `d1-1`'s markers sit on
 * `twoRooms`' map: `walk` in the start room, `far` in room 1.
 */

const step = (
  id: string,
  where: TutorialStep['where'],
  trigger: TutorialTrigger,
  more: Partial<TutorialStep> = {},
): TutorialStep => ({ id, where, line: id, objective: id, trigger, ...more });

const on = (floor: string) => ({ floor });

export const SCRIPT: TutorialStep[] = [
  step('go', 'anvil', { type: 'reachDepth', count: 1 }),
  step(
    'walk',
    'floor',
    { type: 'marker', filter: { id: 'walk' }, count: 1 },
    {
      ...on('d1-1'),
      marker: 'walk',
      gate: { door: 0 },
    },
  ),
  step(
    'rats',
    'floor',
    { type: 'kill', filter: { kind: 'normal' }, count: 2 },
    {
      ...on('d1-1'),
      gate: { exit: true },
    },
  ),
  step('look', 'floor', { type: 'ack', count: 1 }, { ...on('d1-1'), beat: true }),
  step(
    'far',
    'floor',
    { type: 'marker', filter: { id: 'far' }, count: 1 },
    {
      ...on('d1-1'),
      marker: 'far',
    },
  ),
  step(
    'perfect',
    'floor',
    { type: 'perfectDodge', count: 1 },
    {
      ...on('d1-1'),
      gate: { exit: true },
      skipAfter: 2,
    },
  ),
  step('exit', 'floor', { type: 'clearFloor', count: 1 }, on('d1-1')),
  step(
    'equip',
    'stop',
    { type: 'takeStop', filter: { kind: 'equip' }, count: 1 },
    {
      ...on('d1-1'),
      stop: { kinds: ['equip', 'upgrade'], doors: ['winding'], extract: false },
    },
  ),
  step(
    'door',
    'stop',
    { type: 'reachDepth', count: 1 },
    {
      ...on('d1-1'),
      stop: { kinds: ['equip', 'upgrade'], doors: ['winding'], extract: false },
    },
  ),
  step(
    'react',
    'floor',
    { type: 'reaction', filter: { pair: true }, count: 2 },
    {
      ...on('d1-2'),
      gate: { exit: true },
      skipAfter: 3,
    },
  ),
  step('den', 'floor', { type: 'potion', count: 1 }, { ...on('d1-2'), gate: { exit: true } }),
  step(
    'exit2',
    'floor',
    { type: 'clearFloor', count: 1 },
    {
      ...on('d1-2'),
      alcove: { kinds: ['upgrade', 'slot'] },
    },
  ),
  step(
    'home',
    'stop',
    { type: 'extract', count: 1 },
    {
      ...on('d1-2'),
      stop: { kinds: [], doors: [], extract: true },
    },
  ),
  step('claim', 'anvil', { type: 'claim', count: 1 }),
  step('forge', 'anvil', {
    type: 'forge',
    filter: { slot: 'chest', rarity: 'uncommon' },
    count: 1,
  }),
  step('bind', 'anvil', { type: 'bind', count: 1 }),
  step('train', 'training', { type: 'cast', filter: { slot: 1 }, count: 1 }),
  step('bye', 'anvil', { type: 'ack', count: 1 }, { beat: true }),
];

const real = createDefaultRegistry().getTutorialData();

/** The default registry with `SCRIPT` as its tutorial's steps. */
export const script = new DataRegistry({
  ...loadAndValidateData(),
  tutorial: {
    ...real,
    steps: SCRIPT,
    floors: real.floors.map((f) =>
      f.id === 'd1-1'
        ? {
            ...f,
            markers: [
              { id: 'walk', at: { x: 6.5, y: 6 } },
              { id: 'far', at: { x: 19, y: 3 } },
            ],
          }
        : f,
    ),
  },
});

/** A new Fire save on `SCRIPT`'s step `step` (with scrap to spare). */
export function onStep(step: string, seed = 5): DelveProfile {
  const p = createDelveProfile(script, seed, { primary: 'fire' });
  return { ...p, scrap: 1000, tutorial: { step, count: 0, misses: 0 } };
}
