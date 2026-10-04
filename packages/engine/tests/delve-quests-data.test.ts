import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { questsDataProblems } from '../src/data/quests-check.js';
import { DataRegistry } from '../src/data/registry.js';
import { QuestsBalanceSchema, QuestsDataSchema } from '../src/data/schemas.js';
import questsData from '../src/data/quests.json';
import {
  OBJECTIVE_RULES,
  OBJECTIVE_TYPES,
  type ContractTemplate,
  type QuestDef,
  type QuestsData,
} from '../src/types/quests.js';

// See the quests spec: "The quest model" and "Data, tuning and the save".

const registry = createDefaultRegistry();

/** A side quest: one objective (a perfect dodge unless `objective` says otherwise) and 10 scrap. */
const quest = (id: string, over: object = {}, objective: object = {}): QuestDef =>
  ({
    id,
    kind: 'side',
    name: id,
    line: 'A line.',
    objectives: [
      { id: 'o', type: 'perfectDodge', count: 1, scope: 'total', text: 'Do it', ...objective },
    ],
    rewards: [{ kind: 'scrap', count: 10 }],
    ...over,
  }) as QuestDef;
const template: ContractTemplate = {
  id: 'cull',
  name: 'Cull',
  line: 'A line.',
  type: 'kill',
  filter: { kind: 'elite', biome: 'reached' },
  count: { easy: [3, 5], normal: [6, 9], hard: [10, 14] },
  scope: 'total',
  text: 'Slay elites',
  rewards: {
    easy: [{ kind: 'scrap', count: 30 }],
    normal: [{ kind: 'dust', count: 10 }],
    hard: [{ kind: 'essence', id: 'fit', count: 1 }],
  },
};
const data = (quests: QuestDef[], contractTemplates: ContractTemplate[] = []): QuestsData => ({
  giver: questsData.giver,
  rarityNames: questsData.rarityNames,
  quests,
  contractTemplates,
});
const ok = (d: QuestsData) => QuestsDataSchema.safeParse(d).success;
/** The registry's checks on `d` in place of quests.json. */
function problems(d: QuestsData): string[] {
  const x = loadAndValidateData();
  const r = new DataRegistry({ ...x, quests: d });
  return questsDataProblems(r);
}

describe('quests.json', () => {
  it('loads, Hesta giving, and refers only to data that exists', () => {
    expect(registry.getQuestsData().giver).toEqual({ name: 'Hesta', sprite: 'hesta' });
    expect(registry.getQuestsData().quests.length).toBeGreaterThan(0);
    expect(questsDataProblems(registry)).toEqual([]);
  });

  it('has a rule for each objective type: the Anvil-only ones and the state ones marked', () => {
    expect(Object.keys(OBJECTIVE_RULES)).toEqual([...OBJECTIVE_TYPES]);
    const where = (f: (t: (typeof OBJECTIVE_TYPES)[number]) => boolean) =>
      OBJECTIVE_TYPES.filter(f);
    expect(where((t) => OBJECTIVE_RULES[t].anvilOnly)).toEqual([
      'forge',
      'refine',
      'bind',
      'openSocket',
      'knowPatterns',
    ]);
    expect(where((t) => OBJECTIVE_RULES[t].progress === 'state')).toEqual([
      'bind',
      'knowPatterns',
      'discoverReaction',
    ]);
    expect(where((t) => OBJECTIVE_RULES[t].progress === 'max')).toEqual(['reachDepth']);
  });
});

describe('QuestsDataSchema', () => {
  it('accepts the data, every filter its type takes, and a template', () => {
    expect(ok(questsData as QuestsData)).toBe(true);
    const filtered = [
      quest(
        'a',
        {},
        { type: 'kill', filter: { kind: 'elite', biome: 'frostvault', element: 'frost' } },
      ),
      quest(
        'b',
        {},
        { type: 'clearFloor', filter: { noPotion: true, noDamage: true, minDepth: 5 } },
      ),
      quest('c', {}, { type: 'reaction', filter: { pair: true }, scope: 'dive' }),
      quest('d', {}, { type: 'forge', filter: { minRarity: 'uncommon', legendary: true } }),
    ];
    expect(ok(data(filtered, [template]))).toBe(true);
  });

  it("refuses a filter its type doesn't take, a reaction with the pair, and a dive scope on an Anvil-only type", () => {
    expect(ok(data([quest('a', {}, { filter: { biome: 'frostvault' } })]))).toBe(false);
    expect(ok(data([quest('a', {}, { type: 'kill', filter: { kind: 'boss' } })]))).toBe(false);
    expect(
      ok(data([quest('a', {}, { type: 'reaction', filter: { reaction: 'melt', pair: true } })])),
    ).toBe(false);
    for (const type of ['forge', 'refine', 'bind', 'openSocket', 'knowPatterns'])
      expect(ok(data([quest('a', {}, { type, scope: 'dive' })])), type).toBe(false);
    expect(ok(data([], [{ ...template, type: 'refine', filter: undefined, scope: 'dive' }]))).toBe(
      false,
    );
  });

  it('refuses repeated ids, a contract: id, no objectives or four, and an empty unlock', () => {
    expect(ok(data([quest('a'), quest('a')]))).toBe(false);
    expect(ok(data([], [template, template]))).toBe(false);
    expect(ok(data([quest('contract:1')]))).toBe(false);
    expect(ok(data([quest('a', { objectives: [] })]))).toBe(false);
    const o = quest('a').objectives[0];
    const four = ['w', 'x', 'y', 'z'].map((id) => ({ ...o, id }));
    expect(ok(data([quest('a', { objectives: four })]))).toBe(false);
    expect(ok(data([quest('a', { objectives: four.slice(1) })]))).toBe(true);
    expect(ok(data([quest('a', { objectives: [o, o] })]))).toBe(false);
    expect(ok(data([quest('a', { unlock: {} })]))).toBe(false);
    expect(ok(data([quest('a', { unlock: { after: 'b', bestDepth: 6 } }), quest('b')]))).toBe(true);
  });

  it('refuses a reward that names too little or too much for its kind', () => {
    const rewards = (...rs: object[]) => data([quest('a', { rewards: rs })]);
    const good = [
      { kind: 'metal', id: 'depth', count: 3 },
      { kind: 'metal', id: 'iron', count: 3 },
      { kind: 'flux', grade: 'epic', count: 1 },
      { kind: 'shard', family: 'offense', tier: 3, count: 1 },
      { kind: 'essence', id: 'fit', count: 1 },
      { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 20 } },
      { kind: 'links', count: 2 },
    ];
    for (const r of good) expect(ok(rewards(r)), JSON.stringify(r)).toBe(true);
    const bad = [
      { kind: 'metal', id: 'gold', count: 3 },
      { kind: 'metal', count: 3 },
      { kind: 'flux', count: 1 },
      { kind: 'shard', family: 'offense', count: 1 },
      { kind: 'shard', family: 'offense', tier: 6, count: 1 },
      { kind: 'pattern', id: 'unknown', count: 1 },
      { kind: 'scrap', id: 'x', count: 5 },
      { kind: 'scrap', count: 0 },
      { kind: 'gold', count: 1 },
    ];
    for (const r of bad) expect(ok(rewards(r)), JSON.stringify(r)).toBe(false);
    expect(ok(data([quest('a', { rewards: [] })]))).toBe(false);
  });
});

describe("the registry's quests checks", () => {
  it('finds an unknown biome, pattern, essence or quest to unlock after', () => {
    expect(problems(data([quest('a')], [template]))).toEqual([]);
    expect(
      problems(
        data([
          quest('a', {}, { type: 'boss', filter: { biome: 'moon' } }),
          quest('b', {
            rewards: [
              { kind: 'pattern', id: 'spork', count: 1 },
              { kind: 'essence', id: 'nope', count: 1 },
              {
                kind: 'pattern',
                id: 'unknown',
                count: 1,
                fallback: { kind: 'pattern', id: 'x', count: 1 },
              },
            ],
          }),
          quest('c', { unlock: { after: 'zz' } }),
        ]),
      ),
    ).toEqual([
      'a: no biome moon',
      'b: no pattern spork',
      'b: no legendary nope',
      'b: no pattern x',
      'c: no quest zz',
    ]);
    expect(
      problems(
        data(
          [],
          [
            {
              ...template,
              rewards: { ...template.rewards, hard: [{ kind: 'essence', id: 'nope', count: 1 }] },
            },
          ],
        ),
      ),
    ).toEqual(['cull: no legendary nope']);
  });

  it('the main quests form one chain, each unlocking after the one before', () => {
    const main = (id: string, after?: string) =>
      quest(id, { kind: 'main', ...(after ? { unlock: { after } } : {}) });
    expect(
      problems(
        data([main('a'), main('c', 'b'), main('b', 'a'), quest('s', { unlock: { after: 'c' } })]),
      ),
    ).toEqual([]);
    expect(problems(data([main('a'), main('b')]))).toEqual([
      'the main chain has one first quest, with no after',
    ]);
    expect(problems(data([main('a'), main('b', 'a'), main('c', 'a')]))).toEqual([
      'the main chain forks after a',
      'every main quest is on the one chain',
    ]);
    expect(problems(data([main('a'), quest('s'), main('b', 's')]))).toEqual([
      'every main quest is on the one chain',
    ]);
  });
});

describe('delve.quests', () => {
  const quests = registry.getDelveBalance().quests;

  it('holds the tracker and the Contract board numbers', () => {
    expect(quests).toEqual({
      maxTracked: 3,
      contracts: {
        slots: 3,
        tierWeights: { easy: 5, normal: 4, hard: 2 },
        depthScale: 0.05,
        depthWindow: [-2, 3],
        flagDepthBelow: 2,
        rerollScrap: 30,
        essenceChance: 0.15,
        countScale: { kill: 0.1, reaction: 0.1 },
      },
    });
  });

  it('refuses a window that runs backwards, no weight on any tier, a chance above 1 or no tracking', () => {
    const ok = (contracts: object, over: object = {}) =>
      QuestsBalanceSchema.safeParse({
        ...quests,
        ...over,
        contracts: { ...quests.contracts, ...contracts },
      }).success;
    expect(ok({})).toBe(true);
    expect(ok({ depthWindow: [3, -2] })).toBe(false);
    expect(ok({ tierWeights: { easy: 0, normal: 0, hard: 0 } })).toBe(false);
    expect(ok({ essenceChance: 1.5 })).toBe(false);
    expect(ok({}, { maxTracked: 0 })).toBe(false);
  });
});
