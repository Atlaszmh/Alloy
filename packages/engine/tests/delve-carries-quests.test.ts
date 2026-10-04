import { describe, it, expect } from 'vitest';
import { createDefaultRegistry } from '../src/data/default-registry.js';
import { bindSecondary } from '../src/delve/pair.js';
import { createDelveProfile } from '../src/delve/profile.js';
import { applyQuestEvents, questStates } from '../src/delve/quests.js';
import type { DelveProfile } from '../src/types/delve.js';
import type { QuestEvent } from '../src/types/quests.js';

// See the tutorial spec's "Quest unlocks": a quest unlocks when the one it follows is complete,
// claimed or not, so progress flows through a dive; and the quests.json changes.

const registry = createDefaultRegistry();
const fresh = () => createDelveProfile(registry, 4, { primary: 'fire' });
const apply = (p: DelveProfile, ...events: QuestEvent[]) => applyQuestEvents(registry, p, events);
const status = (p: DelveProfile, id: string) =>
  questStates(registry, p).find((s) => s.id === id)?.status;
const DIVE_1: QuestEvent[] = [
  { type: 'reachDepth', depth: 2 },
  { type: 'extract', depth: 3 },
];
/** A new save after dive 1: depth 2 reached, then the extract (two banks: a quest starts afresh). */
const afterDive1 = () => apply(apply(fresh(), DIVE_1[0]), DIVE_1[1]);

describe('quests unlock on completion', () => {
  it("First Steps done mid-dive opens Bring It Home, afresh, which counts that dive's extract", () => {
    const deep = apply(fresh(), DIVE_1[0]);
    expect(status(deep, 'first_steps')).toBe('complete');
    expect(deep.quests.progress.bring_it_home).toEqual([{ value: 0, done: false }]);
    // It takes the tracked slot of the quest it follows, which waits in the journal to be claimed.
    expect(deep.quests.tracked).toEqual(['bring_it_home']);
    // In the same call the extract would not count: a quest starts afresh.
    expect(status(apply(fresh(), ...DIVE_1), 'bring_it_home')).toBe('active');
    const home = apply(deep, DIVE_1[1]);
    expect(status(home, 'bring_it_home')).toBe('complete');
    expect(home.quests.claimed).toEqual([]);
    // Its side quests and the next main quest open with it.
    expect(home.quests.unlocked).toEqual(
      expect.arrayContaining(['strike_the_anvil', 'deep_diver', 'perfect_form']),
    );
    expect(home.quests.tracked).toEqual(['strike_the_anvil']);
  });

  it('one call cascades down the chain: a forge after an early bind opens A Second Flame done, then Spark and Counterspark', () => {
    const bound = bindSecondary(registry, afterDive1(), 'frost').profile;
    const p = apply(bound, { type: 'forge', rarity: 'uncommon', legendary: false });
    expect(['strike_the_anvil', 'a_second_flame'].map((id) => status(p, id))).toEqual([
      'complete',
      'complete',
    ]);
    expect(status(p, 'spark_and_counterspark')).toBe('active');
    expect(p.quests.unlocked).toEqual(expect.arrayContaining(['smelter', 'fully_socketed']));
    expect(p.quests.tracked).toEqual(['spark_and_counterspark']);
  });

  it("Spark and Counterspark done mid-dive opens the Cinder Warden, so Grask's fall counts; it asks a rare forge", () => {
    const bound = bindSecondary(registry, afterDive1(), 'frost').profile;
    const forged = apply(bound, { type: 'forge', rarity: 'uncommon', legendary: false });
    const melt = registry.getReactionFor('fire', 'frost').id;
    const sparked = apply(forged, ...Array(5).fill({ type: 'reaction', reaction: melt }));
    expect(status(sparked, 'the_cinder_warden')).toBe('active');
    const grask = apply(sparked, { type: 'boss', biome: 'cinder_mines' });
    expect(grask.quests.progress.the_cinder_warden).toEqual([
      { value: 1, done: true },
      { value: 0, done: false },
    ]);
    const magic = apply(grask, { type: 'forge', rarity: 'magic', legendary: false });
    expect(status(magic, 'the_cinder_warden')).toBe('active');
    expect(
      status(
        apply(grask, { type: 'forge', rarity: 'rare', legendary: false }),
        'the_cinder_warden',
      ),
    ).toBe('complete');
  });
});

describe('quests.json', () => {
  const quest = (id: string) => registry.getQuestsData().quests.find((q) => q.id === id)!;

  it('the Cinder Warden asks for Grask and a rare forge; Untouchable gives epic flux, never an essence', () => {
    expect(quest('the_cinder_warden').objectives.map((o) => [o.type, o.filter])).toEqual([
      ['boss', { biome: 'cinder_mines' }],
      ['forge', { minRarity: 'rare' }],
    ]);
    expect(quest('untouchable').rewards).toEqual([
      { kind: 'flux', grade: 'epic', count: 1 },
      { kind: 'scrap', count: 100 },
    ]);
    const all = registry.getQuestsData().quests.flatMap((q) => q.rewards);
    expect(all.filter((r) => r.kind === 'essence')).toEqual([]);
  });
});
