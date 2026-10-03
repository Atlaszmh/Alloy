import { describe, it, expect, vi } from 'vitest';
import { startDive } from '../src/delve/dive.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents, claimQuest, questStates, trackQuest } from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { Contract, QuestEvent, Reward } from '../src/types/quests.js';
import { obj, quest, questRegistry, value } from './fixtures/quests.js';

// Claiming (see the quests spec's "Claiming"), on fixture quests. What a reward
// becomes is `resolveReward`'s (B2's, tested with it): here a pattern reward
// teaches its pattern and any other is its count in scrap.
vi.mock('../src/delve/rewards.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/delve/rewards.js')>()),
  resolveReward: (_registry: unknown, profile: DelveProfile, reward: Reward) =>
    reward.kind === 'pattern'
      ? {
          profile: { ...profile, patterns: [...profile.patterns, reward.id!] },
          granted: { ref: { kind: 'pattern', pattern: reward.id! }, count: 1 },
        }
      : {
          profile: { ...profile, scrap: profile.scrap + reward.count },
          granted: { ref: { kind: 'scrap' }, count: reward.count },
        },
}));

const REFINE: QuestEvent = { type: 'refine' };
const reg = questRegistry([
  quest('m1', [obj('refine', 1)], {
    kind: 'main',
    rewards: [
      { kind: 'scrap', count: 40 },
      { kind: 'dust', count: 2 },
    ],
  }),
  quest('side', [obj('refine', 1)]),
  quest('m2', [obj('bind', 1)], { kind: 'main', unlock: { after: 'm1' } }),
  quest('teach', [obj('refine', 1)], { rewards: [{ kind: 'pattern', id: 'axe', count: 1 }] }),
  quest('collector', [obj('knowPatterns', 4)], { unlock: { after: 'teach' } }),
]);
/** At the Anvil: m1 and side tracked, every refine quest done. */
function done(): DelveProfile {
  const p = createDelveProfile(reg, 1, { primary: 'fire' });
  return applyQuestEvents(reg, trackQuest(reg, p, 'side', true).profile, [REFINE]);
}

describe('claiming', () => {
  it("grants the rewards and claims; the next main quest unlocks into the claimed one's tracked slot", () => {
    const p = done();
    const r = claimQuest(reg, p, 'm1');
    expect(r.ok).toBe(true);
    expect(r.rewards).toEqual([
      { ref: { kind: 'scrap' }, count: 40 },
      { ref: { kind: 'scrap' }, count: 2 },
    ]);
    expect(r.profile.scrap).toBe(p.scrap + 42);
    expect(r.profile.quests).toMatchObject({
      claimed: ['m1'],
      unlocked: ['m1', 'side', 'teach', 'm2'],
      tracked: ['m2', 'side'],
      claimCount: 1,
    });
    expect(questStates(reg, r.profile).map((s) => [s.id, s.status])).toEqual([
      ['m1', 'claimed'],
      ['m2', 'active'],
      ['side', 'complete'],
      ['teach', 'complete'],
    ]);
  });

  it('the next main quest takes the first free slot when the claimed one was not tracked', () => {
    const p = trackQuest(reg, done(), 'm1', false).profile;
    expect(claimQuest(reg, p, 'm1').profile.quests.tracked).toEqual(['side', 'm2']);
  });

  it('an early bind completes the main quest that asks for one when it unlocks', () => {
    const p = bindSecondary(reg, done(), 'frost').profile;
    const r = claimQuest(reg, p, 'm1');
    expect(r.profile.quests.progress.m2).toEqual([{ value: 1, done: true }]);
    expect(questStates(reg, r.profile).find((s) => s.id === 'm2')!.status).toBe('complete');
  });

  it('reads the state types again: a pattern its rewards teach counts at once', () => {
    const r = claimQuest(reg, done(), 'teach');
    expect(r.rewards).toEqual([{ ref: { kind: 'pattern', pattern: 'axe' }, count: 1 }]);
    expect(r.profile.quests.unlocked).toContain('collector');
    expect(value(r.profile, 'collector')).toBe(r.profile.patterns.length);
  });

  it('refuses mid-dive, an unfinished, locked, unknown or claimed quest, changing nothing', () => {
    const p = createDelveProfile(reg, 1, { primary: 'fire' });
    const refused = (q: DelveProfile, id: string) => {
      const r = claimQuest(reg, q, id);
      expect(r.profile).toBe(q);
      return [r.ok, r.reason];
    };
    expect(refused(p, 'm1')).toEqual([false, 'Finish its objectives first']);
    expect(refused(p, 'm2')).toEqual([false, 'No such quest']);
    expect(refused(p, 'nope')).toEqual([false, 'No such quest']);
    expect(refused(claimQuest(reg, done(), 'm1').profile, 'm1')).toEqual([
      false,
      'Already claimed',
    ]);
    expect(refused(startDive(reg, done(), 1), 'm1')).toEqual([
      false,
      'Claim at the Anvil, between dives',
    ]);
  });

  it('a claimed contract leaves the board, tracked and seen, and counts', () => {
    const contract: Contract = {
      id: 'contract:4',
      template: 'refines',
      tier: 'easy',
      name: 'Smelting',
      line: 'Melt it down.',
      objectives: [obj('refine', 2)],
      rewards: [{ kind: 'scrap', count: 25 }],
      progress: [{ value: 1, done: false }],
    };
    let p = createDelveProfile(reg, 1, { primary: 'fire' });
    p = { ...p, quests: { ...p.quests, board: [null, contract, null], seen: ['contract:4'] } };
    p = trackQuest(reg, p, 'contract:4', true).profile;
    expect(claimQuest(reg, p, 'contract:4').reason).toBe('Finish its objectives first');
    p = applyQuestEvents(reg, p, [REFINE]);
    const r = claimQuest(reg, p, 'contract:4');
    expect(r.rewards).toEqual([{ ref: { kind: 'scrap' }, count: 25 }]);
    expect(r.profile.scrap).toBe(p.scrap + 25);
    expect(r.profile.quests).toMatchObject({
      board: [null, null, null],
      tracked: ['m1'],
      seen: [],
      contractsClaimed: 1,
      claimCount: 1,
    });
  });
});
