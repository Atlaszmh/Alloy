import { describe, it, expect, beforeEach } from 'vitest';
import {
  emptyQuests,
  type Contract,
  type Objective,
  type ObjectiveProgress,
  type ProfileQuests,
  type QuestDef,
} from '@alloy/engine';
import { getDelveRegistry } from '@/features/delve/registry';
import { questNotices, useDelveStore } from './delveStore';

// See the quests spec's Notices: the store diffs `profile.quests` on every save.

const registry = getDelveRegistry();
const objective = (id: string, text: string): Objective => ({
  id,
  type: 'perfectDodge',
  count: 3,
  scope: 'total',
  text,
});
const WARDEN: QuestDef = {
  id: 'warden',
  kind: 'main',
  name: 'The Warden',
  line: 'A line.',
  objectives: [objective('boss', 'Beat the boss'), objective('forge', 'Forge a legendary')],
  rewards: [{ kind: 'scrap', count: 10 }],
};
const DODGER: QuestDef = {
  ...WARDEN,
  id: 'dodger',
  kind: 'side',
  name: 'Dodger',
  objectives: [objective('dodge', 'Dodge 3 times')],
};
const DEFS = [WARDEN, DODGER];
const at = (value: number, done = false): ObjectiveProgress => ({ value, done });
const quests = (over: Partial<ProfileQuests> = {}): ProfileQuests => ({
  ...emptyQuests(registry),
  ...over,
});
const contract = (id: string, progress: ObjectiveProgress[]): Contract => ({
  id,
  template: 'cull',
  tier: 'easy',
  name: 'Cull',
  line: 'A line.',
  objectives: [objective('kill', 'Slay 3 elites')],
  rewards: [{ kind: 'scrap', count: 30 }],
  progress,
});

describe('questNotices', () => {
  it('an objective newly done reads "Objective done", with its text', () => {
    const was = quests({ progress: { warden: [at(0), at(0)] } });
    const now = quests({ progress: { warden: [at(3, true), at(0)] } });
    expect(questNotices(DEFS, was, now)).toEqual(['Objective done: Beat the boss']);
  });

  it('a quest whose last objective is done reads "Quest complete" once, not its objectives', () => {
    const was = quests({ progress: { warden: [at(3, true), at(0)], dodger: [at(1)] } });
    const now = quests({ progress: { warden: [at(3, true), at(3, true)], dodger: [at(3, true)] } });
    expect(questNotices(DEFS, was, now)).toEqual([
      'Quest complete: The Warden · claim at the Anvil',
      'Quest complete: Dodger · claim at the Anvil',
    ]);
  });

  it('a quest unlocked already done (an earlier bind, a deep player) is complete at once', () => {
    const now = quests({ progress: { dodger: [at(3, true)] } });
    expect(questNotices(DEFS, quests(), now)).toEqual([
      'Quest complete: Dodger · claim at the Anvil',
    ]);
  });

  it('progress short of done, a dive reset, a claim or the same quests say nothing', () => {
    const was = quests({ progress: { warden: [at(3, true), at(1)], dodger: [at(1)] } });
    const now = quests({ progress: { warden: [at(0, true), at(2)], dodger: [at(2)] } });
    expect(questNotices(DEFS, was, now)).toEqual([]);
    expect(questNotices(DEFS, now, now)).toEqual([]);
    const done = quests({ progress: { dodger: [at(3, true)] } });
    expect(questNotices(DEFS, done, { ...done, claimed: ['dodger'] })).toEqual([]);
  });

  it("the board's contracts, by id: a new, rerolled or claimed contract says nothing until one is done", () => {
    const was = quests({
      board: [contract('contract:1', [at(2)]), contract('contract:2', [at(0)]), null],
    });
    const now = quests({
      board: [contract('contract:1', [at(3, true)]), null, contract('contract:3', [at(0)])],
    });
    expect(questNotices(DEFS, was, now)).toEqual(['Quest complete: Cull · claim at the Anvil']);
    expect(questNotices(DEFS, now, quests({ board: [null, null, null] }))).toEqual([]);
  });
});

describe("the store's quest notices", () => {
  beforeEach(() => {
    localStorage.clear();
    useDelveStore.getState().resetProfile(7, 'fire');
  });

  it('queues them on every save (a bank is a save) and hands them over once', () => {
    const first = registry.getQuestsData().quests[0];
    /** Save the first quest's every objective at `value`. */
    const save = (value: number, done: boolean) => {
      const { profile } = useDelveStore.getState();
      const progress = {
        ...profile.quests.progress,
        [first.id]: first.objectives.map(() => at(value, done)),
      };
      useDelveStore.getState().setProfile({ ...profile, quests: { ...profile.quests, progress } });
    };
    save(0, false);
    useDelveStore.getState().takeNotices();
    save(1, false);
    expect(useDelveStore.getState().notices).toEqual([]);
    save(first.objectives[0].count, true);
    expect(useDelveStore.getState().takeNotices()).toEqual([
      `Quest complete: ${first.name} · claim at the Anvil`,
    ]);
    save(first.objectives[0].count, true);
    expect(useDelveStore.getState().notices).toEqual([]);
  });
});
