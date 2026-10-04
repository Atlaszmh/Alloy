import { describe, it, expect } from 'vitest';
import { startDive } from '../src/delve/dive.js';
import { createDelveProfile } from '../src/delve/profile.js';
import {
  applyQuestEvents,
  markQuestSeen,
  questStates,
  resetDiveQuests,
  trackQuest,
} from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { ManaType } from '../src/types/mana.js';
import type { Rarity } from '../src/types/gear.js';
import type { Contract, Objective, QuestEvent, Reward } from '../src/types/quests.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';

// Quest progress (see the quests spec's quest model and objective table), on fixture quests.

const kill = (kind: 'normal' | 'elite', biome = 'cinder_mines', element: ManaType = 'fire') =>
  ({ type: 'kill', kind, biome, element }) as const;
const floor = (depth: number, noPotion = true, noDamage = true, biome = 'cinder_mines') =>
  ({ type: 'clearFloor', biome, depth, noPotion, noDamage }) as const;
const forged = (rarity: Rarity, legendary = false) =>
  ({ type: 'forge', rarity, legendary }) as const;
const REFINE: QuestEvent = { type: 'refine' };
const DODGE: QuestEvent = { type: 'perfectDodge' };
const BOUND = { primary: 'fire', secondary: 'frost' } as const;

describe('objectives', () => {
  it('each type counts its own events, through every filter it gives', () => {
    const events: QuestEvent[] = [
      kill('elite'),
      kill('normal'),
      kill('elite', 'frostvault', 'frost'),
      floor(4),
      floor(4, false),
      floor(4, true, false),
      floor(2),
      floor(5, true, true, 'frostvault'),
      { type: 'extract', depth: 3 },
      { type: 'extract', depth: 6 },
      { type: 'boss', biome: 'cinder_mines' },
      { type: 'boss', biome: 'frostvault' },
      { type: 'reaction', reaction: 'melt' },
      { type: 'reaction', reaction: 'overload' },
      { type: 'reaction', reaction: 'melt' },
      DODGE,
      forged('uncommon'),
      forged('rare'),
      forged('legendary', true),
      REFINE,
      REFINE,
      { type: 'openSocket' },
      { type: 'bind' },
    ];
    const counts: [Objective, number][] = [
      [obj('kill', 99), 3],
      [obj('kill', 99, { filter: { kind: 'elite' } }), 2],
      [obj('kill', 99, { filter: { biome: 'frostvault' } }), 1],
      [obj('kill', 99, { filter: { element: 'fire' } }), 2],
      [obj('clearFloor', 99), 5],
      [obj('clearFloor', 99, { filter: { noPotion: true, noDamage: true, minDepth: 3 } }), 2],
      [obj('clearFloor', 99, { filter: { biome: 'cinder_mines', minDepth: 4 } }), 3],
      [obj('extract', 99), 2],
      [obj('extract', 99, { filter: { minDepth: 5 } }), 1],
      [obj('boss', 99, { filter: { biome: 'cinder_mines' } }), 1],
      [obj('reaction', 99), 3],
      [obj('reaction', 99, { filter: { reaction: 'melt' } }), 2],
      [obj('perfectDodge', 99), 1],
      [obj('forge', 99), 3],
      [obj('forge', 99, { filter: { minRarity: 'rare' } }), 2],
      [obj('forge', 99, { filter: { legendary: true } }), 1],
      [obj('refine', 99), 2],
      [obj('openSocket', 99), 1],
    ];
    const reg = questRegistry(counts.map(([o], i) => quest(`q${i}`, [o])));
    const p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), events);
    expect(counts.map((_, i) => value(p, `q${i}`))).toEqual(counts.map(([, n]) => n));
  });

  it("a pair filter counts the hero's pair's reaction, read when the event applies", () => {
    const reg = questRegistry([quest('pair', [obj('reaction', 99, { filter: { pair: true } })])]);
    const ours: QuestEvent = { type: 'reaction', reaction: reg.getReactionFor('fire', 'frost').id };
    const other: QuestEvent = {
      type: 'reaction',
      reaction: reg.getReactionFor('fire', 'storm').id,
    };
    let p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), [ours]);
    expect(value(p, 'pair')).toBe(0);
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, [ours, other, ours]);
    expect(value(p, 'pair')).toBe(2);
  });

  it('reachDepth keeps the deepest depth entered; a total one reads bestDepth too', () => {
    const reg = questRegistry([
      quest('deep', [obj('reachDepth', 10)]),
      quest('dive', [obj('reachDepth', 10, { scope: 'dive' })]),
    ]);
    const enter = (depth: number): QuestEvent => ({ type: 'reachDepth', depth });
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, { ...p, bestDepth: 6 }, []);
    expect([value(p, 'deep'), value(p, 'dive')]).toEqual([6, 0]);
    p = applyQuestEvents(reg, p, [enter(3), enter(4)]);
    expect([value(p, 'deep'), value(p, 'dive')]).toEqual([6, 4]);
    p = applyQuestEvents(reg, p, [enter(2)]);
    expect(value(p, 'dive')).toBe(4);
    p = applyQuestEvents(reg, { ...p, bestDepth: 12 }, [enter(12)]);
    expect(p.quests.progress.deep).toEqual([{ value: 10, done: true }]);
    expect(p.quests.progress.dive).toEqual([{ value: 10, done: true }]);
  });

  it('the state types read the profile on every call, with events or none', () => {
    const reg = questRegistry([
      quest('bind', [obj('bind', 1)]),
      quest('patterns', [obj('knowPatterns', 6)]),
      quest('reactions', [obj('discoverReaction', 5)]),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    const known = p.patterns.length;
    expect([value(p, 'bind'), value(p, 'patterns'), value(p, 'reactions')]).toEqual([0, known, 0]);
    p = applyQuestEvents(
      reg,
      { ...p, pair: BOUND, patterns: [...p.patterns, 'axe'], reactionsSeen: ['melt', 'overload'] },
      [],
    );
    expect([value(p, 'bind'), value(p, 'patterns'), value(p, 'reactions')]).toEqual([
      1,
      known + 1,
      2,
    ]);
    expect(p.quests.progress.bind).toEqual([{ value: 1, done: true }]);
  });

  it('progress is capped at the count, and a done objective stays done', () => {
    const reg = questRegistry([quest('two', [obj('refine', 2), obj('perfectDodge', 1)])]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, p, [REFINE, REFINE, REFINE]);
    expect(p.quests.progress.two).toEqual([
      { value: 2, done: true },
      { value: 0, done: false },
    ]);
    p = applyQuestEvents(reg, p, [DODGE, REFINE]);
    expect(p.quests.progress.two).toEqual([
      { value: 2, done: true },
      { value: 1, done: true },
    ]);
  });

  it('resetDiveQuests zeroes unfinished dive-scoped objectives, contracts too; a done one survives', () => {
    const reg = questRegistry([
      quest('dive', [obj('perfectDodge', 3, { scope: 'dive' })]),
      quest('total', [obj('perfectDodge', 3)]),
      quest('quick', [obj('perfectDodge', 1, { scope: 'dive' })]),
    ]);
    const contract = {
      id: 'contract:0',
      template: 'dodges',
      tier: 'easy' as const,
      name: 'Light Feet',
      line: 'Dance.',
      objectives: [obj('perfectDodge', 5, { scope: 'dive' })],
      rewards: [],
      progress: [{ value: 0, done: false }],
    };
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = { ...p, quests: { ...p.quests, board: [contract, null, null] } };
    p = applyQuestEvents(reg, p, [DODGE, DODGE]);
    expect(p.quests.board[0]!.progress).toEqual([{ value: 2, done: false }]);
    p = resetDiveQuests(reg, p);
    expect(['dive', 'total', 'quick'].map((id) => value(p, id))).toEqual([0, 2, 1]);
    expect(p.quests.progress.quick).toEqual([{ value: 1, done: true }]);
    expect(p.quests.board[0]!.progress).toEqual([{ value: 0, done: false }]);
  });
});

describe('unlocks', () => {
  it('a new save unlocks every quest without an unlock, and tracks the first main quest', () => {
    const reg = questRegistry([
      quest('m1', [obj('refine', 1)], { kind: 'main' }),
      quest('m2', [obj('refine', 1)], { kind: 'main', unlock: { after: 'm1' } }),
      quest('side', [obj('refine', 1)]),
    ]);
    const p = createDelveProfile(reg, 1, { primary: 'fire' });
    expect(p.quests).toMatchObject({ unlocked: ['m1', 'side'], tracked: ['m1'] });
    expect(p.quests.progress).toEqual({
      m1: [{ value: 0, done: false }],
      side: [{ value: 0, done: false }],
    });
  });

  it('a side quest unlocks once every condition it gives holds, checked at every call', () => {
    const o = [obj('refine', 1)];
    const reg = questRegistry([
      quest('deep', o, { unlock: { bestDepth: 6 } }),
      quest('seen', o, { unlock: { reactionsSeen: 2 } }),
      quest('known', o, { unlock: { patterns: 4 } }),
      quest('bound', o, { unlock: { pair: true } }),
      quest('both', o, { unlock: { bestDepth: 6, pair: true } }),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    expect(p.quests.unlocked).toEqual([]);
    p = applyQuestEvents(reg, { ...p, bestDepth: 6 }, []);
    expect(p.quests.unlocked).toEqual(['deep']);
    p = applyQuestEvents(
      reg,
      { ...p, reactionsSeen: ['melt', 'overload'], patterns: [...p.patterns, 'axe'] },
      [],
    );
    expect(p.quests.unlocked).toEqual(['deep', 'seen', 'known']);
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, []);
    expect(p.quests.unlocked).toEqual(['deep', 'seen', 'known', 'bound', 'both']);
    expect(p.quests.tracked).toEqual([]);
  });

  it('a sum counts from the unlock on; a state credits at once (an early bind completes a bind quest)', () => {
    const reg = questRegistry([
      quest('refines', [obj('refine', 5)], { unlock: { bestDepth: 3 } }),
      quest('second', [obj('bind', 1)], { unlock: { bestDepth: 3 } }),
    ]);
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = applyQuestEvents(reg, { ...p, pair: BOUND }, [REFINE]);
    p = applyQuestEvents(reg, { ...p, bestDepth: 3 }, [REFINE]);
    expect(p.quests.unlocked).toEqual(['refines', 'second']);
    expect(value(p, 'refines')).toBe(0);
    expect(p.quests.progress.second).toEqual([{ value: 1, done: true }]);
    p = applyQuestEvents(reg, p, [REFINE]);
    expect(value(p, 'refines')).toBe(1);
  });
});

describe('the quest view, tracking and NEW', () => {
  const REWARDS: Reward[] = [
    { kind: 'scrap', count: 40 },
    { kind: 'metal', id: 'depth', count: 3 },
    { kind: 'metal', id: 'iron', count: 2 },
    { kind: 'flux', grade: 'magic', count: 1 },
    { kind: 'shard', family: 'offense', tier: 3, count: 1 },
    { kind: 'essence', id: 'fit', count: 1 },
    { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 5 } },
  ];
  // Out of order in the data: the view lists the main quests by the chain.
  const reg = questRegistry([
    quest('a', [obj('refine', 1)]),
    quest('m2', [obj('refine', 1)], { kind: 'main', unlock: { after: 'm1' } }),
    quest('m1', [obj('refine', 2, { text: 'Refine twice' })], {
      kind: 'main',
      chapter: 'One',
      rewards: REWARDS,
    }),
    quest('b', [obj('refine', 1)]),
    quest('c', [obj('refine', 1)]),
    quest('locked', [obj('refine', 1)], { unlock: { bestDepth: 9 } }),
  ]);
  const contract: Contract = {
    id: 'contract:0',
    template: 'dodges',
    tier: 'easy',
    name: 'Light Feet',
    line: 'Dance.',
    objectives: [obj('perfectDodge', 3, { text: 'Dodge 3' })],
    rewards: [{ kind: 'dust', count: 4 }],
    progress: [{ value: 1, done: false }],
  };
  const start = (): DelveProfile => {
    const p = applyQuestEvents(reg, createDelveProfile(reg, 1, { primary: 'fire' }), [REFINE]);
    return { ...p, quests: { ...p.quests, board: [null, contract, null] } };
  };

  it('shows the main quests by the chain, the side quests, then the contracts; rewards as refs, or rules', () => {
    const states = questStates(reg, start());
    expect(states.map((s) => s.id)).toEqual(['m1', 'a', 'b', 'c', 'contract:0']);
    expect(states[0]).toEqual({
      id: 'm1',
      kind: 'main',
      status: 'active',
      isNew: true,
      tracked: true,
      name: 'm1',
      line: "m1's line",
      chapter: 'One',
      objectives: [{ id: 'refine', text: 'Refine twice', value: 1, count: 2, done: false }],
      rewards: [
        { ref: { kind: 'scrap' }, count: 40 },
        { rule: REWARDS[1] },
        { ref: { kind: 'metal', metal: 'iron' }, count: 2 },
        { ref: { kind: 'flux', grade: 'magic' }, count: 1 },
        { rule: REWARDS[4] },
        { rule: REWARDS[5] },
        { rule: REWARDS[6] },
      ],
    });
    expect(states[4]).toEqual({
      id: 'contract:0',
      kind: 'contract',
      status: 'active',
      isNew: true,
      tracked: false,
      name: 'Light Feet',
      line: 'Dance.',
      objectives: [{ id: 'perfectDodge', text: 'Dodge 3', value: 1, count: 3, done: false }],
      rewards: [{ ref: { kind: 'dust' }, count: 4 }],
    });
  });

  it('a contract advances on the board; complete once every objective is done, claimed once claimed', () => {
    let p = applyQuestEvents(reg, start(), [DODGE, DODGE, REFINE]);
    expect(p.quests.board[1]!.progress).toEqual([{ value: 3, done: true }]);
    // m1's second refine completed it: m2 unlocked then, afresh.
    expect(questStates(reg, p).map((s) => [s.id, s.status])).toEqual([
      ['m1', 'complete'],
      ['m2', 'active'],
      ['a', 'complete'],
      ['b', 'complete'],
      ['c', 'complete'],
      ['contract:0', 'complete'],
    ]);
    p = applyQuestEvents(reg, { ...p, quests: { ...p.quests, claimed: ['m1'] } }, []);
    expect(questStates(reg, p).map((s) => [s.id, s.status, s.isNew])).toEqual([
      ['m1', 'claimed', false],
      ['m2', 'active', true],
      ['a', 'complete', true],
      ['b', 'complete', true],
      ['c', 'complete', true],
      ['contract:0', 'complete', true],
    ]);
  });

  it('tracks up to maxTracked and untracks; only an open quest; mid-dive too', () => {
    const max = reg.getDelveBalance().quests.maxTracked;
    let p = start();
    expect(p.quests.tracked).toEqual(['m1']);
    p = trackQuest(reg, p, 'a', true).profile;
    p = trackQuest(reg, p, 'contract:0', true).profile;
    expect(p.quests.tracked).toEqual(['m1', 'a', 'contract:0']);
    expect(trackQuest(reg, p, 'b', true)).toEqual({
      ok: false,
      profile: p,
      reason: `Track at most ${max} quests`,
    });
    expect(trackQuest(reg, p, 'a', true)).toEqual({ ok: true, profile: p });
    for (const id of ['locked', 'nope'])
      expect(trackQuest(reg, p, id, true).reason).toBe('No such quest');
    p = trackQuest(reg, p, 'm1', false).profile;
    expect(p.quests.tracked).toEqual(['a', 'contract:0']);
    const diving = startDive(reg, p, 1);
    expect(trackQuest(reg, diving, 'b', true).profile.quests.tracked).toEqual([
      'a',
      'contract:0',
      'b',
    ]);
  });

  it('a quest opened in the journal is NEW no more; mid-dive too', () => {
    const p = startDive(reg, start(), 1);
    const seen = markQuestSeen(reg, markQuestSeen(reg, p, 'a'), 'contract:0');
    expect(seen.quests.seen).toEqual(['a', 'contract:0']);
    expect(questStates(reg, seen).map((s) => s.isNew)).toEqual([true, false, true, true, false]);
    expect(markQuestSeen(reg, seen, 'a')).toBe(seen);
    expect(markQuestSeen(reg, seen, 'locked')).toBe(seen);
  });
});
